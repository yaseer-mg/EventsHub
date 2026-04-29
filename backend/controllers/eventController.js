const Joi = require('joi');

const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');

const EVENT_STATUSES = ['upcoming', 'ongoing', 'completed', 'cancelled'];
const STATUS_TRANSITIONS = {
  upcoming: ['ongoing', 'cancelled'],
  ongoing: ['completed', 'cancelled'],
};

const updateEventStatusSchema = Joi.object({
  status: Joi.string()
    .valid(...EVENT_STATUSES)
    .required(),
});

function validate(schema, payload) {
  return schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
  });
}

function normalizeDateOnly(value) {
  if (!value) {
    return null;
  }

  const trimmed = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const date = new Date(trimmed);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function parsePagination(queryParams) {
  const page = Math.max(Number.parseInt(queryParams.page, 10) || 1, 1);
  const limit = Math.max(Number.parseInt(queryParams.limit, 10) || 20, 1);

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

function buildEventFilters(filters, tenantId, startingIndex = 1) {
  const conditions = [`e.tenant_id = $${startingIndex}`];
  const values = [tenantId];
  let index = startingIndex + 1;

  if (filters.status) {
    conditions.push(`e.status = $${index}`);
    values.push(filters.status);
    index += 1;
  }

  if (filters.from) {
    conditions.push(`e.event_date >= $${index}`);
    values.push(filters.from);
    index += 1;
  }

  if (filters.to) {
    conditions.push(`e.event_date <= $${index}`);
    values.push(filters.to);
    index += 1;
  }

  if (filters.search) {
    conditions.push(`(
      b.event_name ILIKE $${index}
      OR b.event_type ILIKE $${index}
      OR c.full_name ILIKE $${index}
      OR c.phone ILIKE $${index}
      OR h.name ILIKE $${index}
    )`);
    values.push(`%${filters.search}%`);
    index += 1;
  }

  return {
    whereClause: `WHERE ${conditions.join(' AND ')}`,
    values,
    nextIndex: index,
  };
}

async function getOwnedEvent(eventId, tenantId, db = { query }) {
  const result = await db.query(
    'SELECT * FROM events WHERE id = $1 AND tenant_id = $2',
    [eventId, tenantId]
  );

  return result.rows[0];
}

async function getEventDetails(eventId, tenantId, db = { query }) {
  const eventResult = await db.query(
    `SELECT e.*,
            b.event_name,
            b.event_type,
            b.guest_count,
            b.payment_status,
            b.amount_due,
            b.amount_paid,
            b.notes AS booking_notes,
            b.client_id,
            b.hall_id,
            b.created_by AS booking_created_by,
            c.full_name AS client_name,
            c.email AS client_email,
            c.phone AS client_phone,
            c.address AS client_address,
            c.notes AS client_notes,
            h.name AS hall_name,
            h.capacity AS hall_capacity,
            h.description AS hall_description,
            h.price_per_hour AS hall_price_per_hour,
            u.full_name AS approved_by_name,
            u.email AS approved_by_email
     FROM events e
     JOIN bookings b ON e.booking_id = b.id
     JOIN clients c ON b.client_id = c.id
     LEFT JOIN halls h ON b.hall_id = h.id
     LEFT JOIN users u ON e.approved_by = u.id
     WHERE e.id = $1 AND e.tenant_id = $2`,
    [eventId, tenantId]
  );

  return eventResult.rows[0] || null;
}

async function getAllEvents(req, res, next) {
  try {
    const filters = {
      status: req.query.status ? String(req.query.status).trim() : '',
      from: req.query.from ? normalizeDateOnly(req.query.from) : '',
      to: req.query.to ? normalizeDateOnly(req.query.to) : '',
      search: req.query.search ? String(req.query.search).trim() : '',
    };

    if (req.query.from && !filters.from) {
      throw new AppError('Invalid from date. Use YYYY-MM-DD', 400);
    }

    if (req.query.to && !filters.to) {
      throw new AppError('Invalid to date. Use YYYY-MM-DD', 400);
    }

    if (filters.status && !EVENT_STATUSES.includes(filters.status)) {
      throw new AppError('Invalid event status filter', 400);
    }

    if (filters.from && filters.to && filters.from > filters.to) {
      throw new AppError('from date cannot be later than to date', 400);
    }

    const { page, limit, offset } = parsePagination(req.query);
    const { whereClause, values, nextIndex } = buildEventFilters(
      filters,
      req.tenantId
    );
    const dataParams = [...values, limit, offset];

    const eventsResult = await query(
      `SELECT e.*,
              b.event_name,
              b.event_type,
              b.guest_count,
              b.payment_status,
              b.amount_due,
              b.amount_paid,
              c.full_name AS client_name,
              c.phone AS client_phone,
              h.name AS hall_name,
              u.full_name AS approved_by_name
       FROM events e
       JOIN bookings b ON e.booking_id = b.id
       JOIN clients c ON b.client_id = c.id
       LEFT JOIN halls h ON b.hall_id = h.id
       LEFT JOIN users u ON e.approved_by = u.id
       ${whereClause}
       ORDER BY e.event_date ASC, e.start_time ASC
       LIMIT $${nextIndex} OFFSET $${nextIndex + 1}`,
      dataParams
    );

    const countResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM events e
       JOIN bookings b ON e.booking_id = b.id
       JOIN clients c ON b.client_id = c.id
       LEFT JOIN halls h ON b.hall_id = h.id
       ${whereClause}`,
      values
    );

    const total = countResult.rows[0].total;
    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      events: eventsResult.rows,
      total,
      page,
      totalPages,
    });
  } catch (error) {
    next(error);
  }
}

async function getEventById(req, res, next) {
  try {
    const event = await getEventDetails(req.params.id, req.tenantId);

    if (!event) {
      throw new AppError('Event not found', 404);
    }

    const attendeesResult = await query(
      `SELECT id, full_name, seat_number, checked_in, checked_in_at
       FROM attendees
       WHERE event_id = $1
       ORDER BY seat_number ASC NULLS LAST, full_name ASC`,
      [req.params.id]
    );

    const attendees = attendeesResult.rows;
    const total = attendees.length;
    const checkedIn = attendees.filter((attendee) => attendee.checked_in).length;
    const notCheckedIn = total - checkedIn;
    const rate = total > 0 ? Number(((checkedIn / total) * 100).toFixed(2)) : 0;

    return res.status(200).json({
      success: true,
      event,
      attendees,
      stats: {
        total,
        checkedIn,
        notCheckedIn,
        rate,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getCalendarEvents(req, res, next) {
  try {
    const from = normalizeDateOnly(req.query.from);
    const to = normalizeDateOnly(req.query.to);

    if (!from || !to) {
      throw new AppError('from and to are required in YYYY-MM-DD format', 400);
    }

    if (from > to) {
      throw new AppError('from date cannot be later than to date', 400);
    }

    const [eventsResult, pendingBookingsResult] = await Promise.all([
      query(
        `SELECT e.id,
                b.event_name AS title,
                e.event_date AS date,
                e.start_time,
                e.end_time,
                e.status,
                b.event_type AS type,
                h.name AS hall_name
         FROM events e
         JOIN bookings b ON e.booking_id = b.id
         LEFT JOIN halls h ON b.hall_id = h.id
         WHERE e.tenant_id = $1
           AND e.event_date BETWEEN $2 AND $3
         ORDER BY e.event_date ASC, e.start_time ASC`,
        [req.tenantId, from, to]
      ),
      query(
        `SELECT b.id,
                b.event_name AS title,
                b.preferred_date AS date,
                b.preferred_time AS start_time,
                b.status,
                b.event_type AS type
         FROM bookings b
         WHERE b.tenant_id = $1
           AND b.status = 'pending'
           AND b.preferred_date BETWEEN $2 AND $3
         ORDER BY b.preferred_date ASC, b.preferred_time ASC`,
        [req.tenantId, from, to]
      ),
    ]);

    return res.status(200).json({
      success: true,
      events: eventsResult.rows,
      pendingBookings: pendingBookingsResult.rows,
    });
  } catch (error) {
    next(error);
  }
}

async function updateEventStatus(req, res, next) {
  try {
    const { value, error } = validate(updateEventStatusSchema, req.body);

    if (error) {
      return next(error);
    }

    const event = await getOwnedEvent(req.params.id, req.tenantId);

    if (!event) {
      throw new AppError('Event not found', 404);
    }

    const allowedTransitions = STATUS_TRANSITIONS[event.status] || [];

    if (!allowedTransitions.includes(value.status)) {
      throw new AppError('Invalid event status transition', 400);
    }

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE events
         SET status = $1
         WHERE id = $2 AND tenant_id = $3`,
        [value.status, req.params.id, req.tenantId]
      );

      await client.query(
        `INSERT INTO audit_log (
           actor_id, actor_email, tenant_id, action,
           resource, resource_id, metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          req.user.id,
          req.user.email,
          req.tenantId,
          'EVENT_STATUS_UPDATED',
          'event',
          req.params.id,
          JSON.stringify({
            previous_status: event.status,
            new_status: value.status,
          }),
        ]
      );
    });

    const updatedEvent = await getEventDetails(req.params.id, req.tenantId);

    return res.status(200).json({
      success: true,
      event: updatedEvent,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAllEvents,
  getEventById,
  getCalendarEvents,
  updateEventStatus,
};
