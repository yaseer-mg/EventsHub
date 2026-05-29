const Joi = require('joi');

const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');

const BOOKING_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];
const PAYMENT_STATUSES = ['unpaid', 'partial', 'paid'];
const EVENT_TYPES = [
  'wedding',
  'conference',
  'birthday',
  'concert',
  'seminar',
  'graduation',
  'religious',
  'other',
];
const STATUS_TRANSITIONS = {
  pending: ['approved', 'rejected'],
  approved: ['cancelled'],
  rejected: ['pending'],
};
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toNumber(value) {
  return Number(value || 0);
}

function toInt(value) {
  return Number.parseInt(value || 0, 10);
}

const createBookingSchema = Joi.object({
  client_id: Joi.string().uuid().required(),
  event_name: Joi.string().max(255).required(),
  event_type: Joi.string()
    .valid(...EVENT_TYPES)
    .required(),
  preferred_date: Joi.date().iso().required(),
  preferred_time: Joi.string().pattern(TIME_REGEX).required(),
  duration_hours: Joi.number().integer().min(1).max(24).default(2),
  guest_count: Joi.number().integer().min(1).required(),
  hall_id: Joi.string().uuid().optional().allow(null),
  notes: Joi.string().optional().allow('', null),
  amount_due: Joi.number().min(0).required(),
  payment_status: Joi.string()
    .valid(...PAYMENT_STATUSES)
    .default('unpaid'),
  amount_paid: Joi.number().min(0).default(0),
}).custom((value, helpers) => {
  if (!isTodayOrFutureDate(value.preferred_date)) {
    return helpers.error('date.min');
  }

  if (value.amount_paid > value.amount_due) {
    return helpers.message('amount_paid cannot be greater than amount_due');
  }

  return value;
}, 'booking create validation');

const updateBookingSchema = Joi.object({
  client_id: Joi.string().uuid().optional(),
  event_name: Joi.string().max(255).optional(),
  event_type: Joi.string()
    .valid(...EVENT_TYPES)
    .optional(),
  preferred_date: Joi.date().iso().optional(),
  preferred_time: Joi.string().pattern(TIME_REGEX).optional(),
  duration_hours: Joi.number().integer().min(1).max(24).optional(),
  guest_count: Joi.number().integer().min(1).optional(),
  hall_id: Joi.string().uuid().optional().allow(null),
  notes: Joi.string().optional().allow('', null),
  amount_due: Joi.number().min(0).optional(),
})
  .min(1)
  .custom((value, helpers) => {
    if (
      Object.prototype.hasOwnProperty.call(value, 'preferred_date') &&
      !isTodayOrFutureDate(value.preferred_date)
    ) {
      return helpers.error('date.min');
    }

    return value;
  }, 'booking update validation')
  .required();

const updateBookingStatusSchema = Joi.object({
  status: Joi.string()
    .valid(...BOOKING_STATUSES)
    .required(),
});

const updatePaymentSchema = Joi.object({
  payment_status: Joi.string()
    .valid(...PAYMENT_STATUSES)
    .required(),
  amount_paid: Joi.number().min(0).required(),
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

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function isTodayOrFutureDate(value) {
  const dateOnly = normalizeDateOnly(value);

  if (!dateOnly) {
    return false;
  }

  const today = new Date().toISOString().slice(0, 10);
  return dateOnly >= today;
}

function calculateEndTime(preferredTime, durationHours) {
  const [hours, minutes] = preferredTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + durationHours * 60;
  const wrappedMinutes = totalMinutes % (24 * 60);
  const endHours = String(Math.floor(wrappedMinutes / 60)).padStart(2, '0');
  const endMinutes = String(wrappedMinutes % 60).padStart(2, '0');

  return `${endHours}:${endMinutes}`;
}

async function getOwnedClient(clientId, tenantId) {
  const result = await query(
    'SELECT * FROM clients WHERE id = $1 AND tenant_id = $2',
    [clientId, tenantId]
  );

  return result.rows[0];
}

async function getOwnedHall(hallId, tenantId) {
  const result = await query(
    'SELECT * FROM halls WHERE id = $1 AND tenant_id = $2',
    [hallId, tenantId]
  );

  return result.rows[0];
}

async function getOwnedBooking(bookingId, tenantId) {
  const result = await query(
    'SELECT * FROM bookings WHERE id = $1 AND tenant_id = $2',
    [bookingId, tenantId]
  );

  return result.rows[0];
}

async function ensureNoBookingConflict({
  hallId,
  tenantId,
  preferredDate,
  preferredTime,
  durationHours,
  excludeBookingId,
}) {
  if (!hallId) {
    return;
  }

  const values = [hallId, tenantId, preferredDate, preferredTime, durationHours];
  let sql = `
    SELECT COUNT(*)::int AS count
    FROM bookings b
    WHERE b.hall_id = $1
      AND b.tenant_id = $2
      AND b.preferred_date = $3
      AND b.status NOT IN ('rejected', 'cancelled')
      AND b.preferred_time < ($4::time + ($5 * INTERVAL '1 hour'))
      AND (b.preferred_time + (b.duration_hours * INTERVAL '1 hour')) > $4::time`;

  if (excludeBookingId) {
    sql += ' AND b.id <> $6';
    values.push(excludeBookingId);
  }

  const result = await query(sql, values);

  if (result.rows[0].count > 0) {
    throw new AppError('Hall already booked for this date/time', 409);
  }
}

async function getBookingDetails(bookingId, tenantId) {
  const bookingResult = await query(
    `SELECT b.*,
            c.full_name AS client_name,
            c.email AS client_email,
            c.phone AS client_phone,
            c.address AS client_address,
            c.notes AS client_notes,
            h.name AS hall_name,
            h.capacity AS hall_capacity,
            h.description AS hall_description,
            h.price_per_hour AS hall_price_per_hour,
            u.full_name AS created_by_name,
            u.email AS created_by_email,
            e.id AS event_id,
            e.event_date,
            e.start_time,
            e.end_time,
            e.status AS event_status,
            e.approved_by,
            e.approved_at
     FROM bookings b
     LEFT JOIN clients c ON b.client_id = c.id
     LEFT JOIN halls h ON b.hall_id = h.id
     LEFT JOIN users u ON b.created_by = u.id
     LEFT JOIN events e ON e.booking_id = b.id
     WHERE b.id = $1 AND b.tenant_id = $2`,
    [bookingId, tenantId]
  );

  const booking = bookingResult.rows[0];

  if (!booking) {
    return null;
  }

  if (booking.event_id) {
    booking.event = {
      id: booking.event_id,
      event_date: booking.event_date,
      start_time: booking.start_time,
      end_time: booking.end_time,
      status: booking.event_status,
      approved_by: booking.approved_by,
      approved_at: booking.approved_at,
    };
  } else {
    booking.event = null;
  }

  return booking;
}

function buildBookingFilters(filters, tenantId, startingIndex = 1) {
  const conditions = [`b.tenant_id = $${startingIndex}`];
  const values = [tenantId];
  let index = startingIndex + 1;

  if (filters.status) {
    conditions.push(`b.status = $${index}`);
    values.push(filters.status);
    index += 1;
  }

  if (filters.payment_status) {
    conditions.push(`b.payment_status = $${index}`);
    values.push(filters.payment_status);
    index += 1;
  }

  if (filters.event_type) {
    conditions.push(`b.event_type = $${index}`);
    values.push(filters.event_type);
    index += 1;
  }

  if (filters.date_from) {
    conditions.push(`b.preferred_date >= $${index}`);
    values.push(filters.date_from);
    index += 1;
  }

  if (filters.date_to) {
    conditions.push(`b.preferred_date <= $${index}`);
    values.push(filters.date_to);
    index += 1;
  }

  if (filters.search) {
    conditions.push(`(
      b.event_name ILIKE $${index}
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

async function getAllBookings(req, res, next) {
  try {
    const filters = {
      status: req.query.status ? String(req.query.status).trim() : '',
      payment_status: req.query.payment_status || req.query.payment
        ? String(req.query.payment_status ?? req.query.payment).trim()
        : '',
      event_type: req.query.event_type ? String(req.query.event_type).trim() : '',
      date_from: req.query.date_from ? String(req.query.date_from).trim() : '',
      date_to: req.query.date_to ? String(req.query.date_to).trim() : '',
      search: req.query.search ? String(req.query.search).trim() : '',
    };
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(Number.parseInt(req.query.limit, 10) || 20, 1);
    const offset = (page - 1) * limit;
    const { whereClause, values, nextIndex } = buildBookingFilters(
      filters,
      req.tenantId
    );
    const dataParams = [...values, limit, offset];

    const bookingsResult = await query(
      `SELECT b.*,
              c.full_name AS client_name,
              c.phone AS client_phone,
              h.name AS hall_name,
              h.capacity AS hall_capacity,
              u.full_name AS created_by_name,
              e.id AS event_id,
              e.status AS event_status
       FROM bookings b
       LEFT JOIN clients c ON b.client_id = c.id
       LEFT JOIN halls h ON b.hall_id = h.id
       LEFT JOIN users u ON b.created_by = u.id
       LEFT JOIN events e ON e.booking_id = b.id
       ${whereClause}
       ORDER BY b.created_at DESC
       LIMIT $${nextIndex} OFFSET $${nextIndex + 1}`,
      dataParams
    );

    const countResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM bookings b
       LEFT JOIN clients c ON b.client_id = c.id
       LEFT JOIN halls h ON b.hall_id = h.id
       ${whereClause}`,
      values
    );

    const summaryResult = await query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE b.status = 'pending')::int AS pending,
              COUNT(*) FILTER (WHERE b.status = 'approved')::int AS approved,
              COALESCE(SUM(b.amount_paid), 0)::numeric AS revenue_collected
       FROM bookings b
       LEFT JOIN clients c ON b.client_id = c.id
       LEFT JOIN halls h ON b.hall_id = h.id
       ${whereClause}`,
      values
    );

    const total = countResult.rows[0].total;
    const totalPages = Math.ceil(total / limit) || 1;
    const summary = summaryResult.rows[0];

    return res.status(200).json({
      success: true,
      bookings: bookingsResult.rows,
      stats: {
        total: toInt(summary.total),
        pending: toInt(summary.pending),
        approved: toInt(summary.approved),
        revenue_collected: toNumber(summary.revenue_collected),
      },
      total,
      page,
      totalPages,
    });
  } catch (error) {
    next(error);
  }
}

async function getBookingById(req, res, next) {
  try {
    const booking = await getBookingDetails(req.params.id, req.tenantId);

    if (!booking) {
      throw new AppError('Booking not found', 404);
    }

    return res.status(200).json({
      success: true,
      booking,
    });
  } catch (error) {
    next(error);
  }
}

async function createBooking(req, res, next) {
  try {
    const { value, error } = validate(createBookingSchema, req.body);

    if (error) {
      return next(error);
    }

    const client = await getOwnedClient(value.client_id, req.tenantId);

    if (!client) {
      throw new AppError('Client not found', 404);
    }

    if (value.hall_id) {
      const hall = await getOwnedHall(value.hall_id, req.tenantId);

      if (!hall) {
        throw new AppError('Hall not found', 404);
      }

      await ensureNoBookingConflict({
        hallId: value.hall_id,
        tenantId: req.tenantId,
        preferredDate: normalizeDateOnly(value.preferred_date),
        preferredTime: value.preferred_time,
        durationHours: value.duration_hours,
      });
    }

    const result = await query(
      `INSERT INTO bookings (
         tenant_id, client_id, hall_id, event_name, event_type,
         preferred_date, preferred_time, duration_hours, guest_count,
         notes, amount_due, payment_status, amount_paid, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        req.tenantId,
        value.client_id,
        value.hall_id || null,
        value.event_name,
        value.event_type,
        normalizeDateOnly(value.preferred_date),
        value.preferred_time,
        value.duration_hours,
        value.guest_count,
        value.notes || null,
        value.amount_due,
        value.payment_status,
        value.amount_paid,
        req.user.id,
      ]
    );

    const booking = await getBookingDetails(result.rows[0].id, req.tenantId);

    return res.status(201).json({
      success: true,
      booking,
    });
  } catch (error) {
    next(error);
  }
}

async function updateBooking(req, res, next) {
  try {
    const existingBooking = await getOwnedBooking(req.params.id, req.tenantId);

    if (!existingBooking) {
      throw new AppError('Booking not found', 404);
    }

    if (existingBooking.status !== 'pending') {
      throw new AppError('Only pending bookings can be edited', 400);
    }

    const { value, error } = validate(updateBookingSchema, req.body);

    if (error) {
      return next(error);
    }

    if (value.client_id) {
      const client = await getOwnedClient(value.client_id, req.tenantId);

      if (!client) {
        throw new AppError('Client not found', 404);
      }
    }

    if (Object.prototype.hasOwnProperty.call(value, 'hall_id') && value.hall_id) {
      const hall = await getOwnedHall(value.hall_id, req.tenantId);

      if (!hall) {
        throw new AppError('Hall not found', 404);
      }
    }

    const mergedBooking = {
      ...existingBooking,
      ...value,
      preferred_date: Object.prototype.hasOwnProperty.call(value, 'preferred_date')
        ? normalizeDateOnly(value.preferred_date)
        : existingBooking.preferred_date,
    };

    await ensureNoBookingConflict({
      hallId: mergedBooking.hall_id,
      tenantId: req.tenantId,
      preferredDate: mergedBooking.preferred_date,
      preferredTime: mergedBooking.preferred_time,
      durationHours: mergedBooking.duration_hours,
      excludeBookingId: req.params.id,
    });

    const fields = [];
    const values = [];
    let index = 1;

    for (const [key, fieldValue] of Object.entries(value)) {
      fields.push(`${key} = $${index}`);
      values.push(key === 'preferred_date' ? normalizeDateOnly(fieldValue) : fieldValue);
      index += 1;
    }

    fields.push(`updated_at = NOW()`);
    values.push(req.params.id, req.tenantId);

    await query(
      `UPDATE bookings
       SET ${fields.join(', ')}
       WHERE id = $${index} AND tenant_id = $${index + 1}`,
      values
    );

    const booking = await getBookingDetails(req.params.id, req.tenantId);

    return res.status(200).json({
      success: true,
      booking,
    });
  } catch (error) {
    next(error);
  }
}

async function updateBookingStatus(req, res, next) {
  try {
    const { value, error } = validate(updateBookingStatusSchema, req.body);

    if (error) {
      return next(error);
    }

    const booking = await getOwnedBooking(req.params.id, req.tenantId);

    if (!booking) {
      throw new AppError('Booking not found', 404);
    }

    const allowedTransitions = STATUS_TRANSITIONS[booking.status] || [];

    if (!allowedTransitions.includes(value.status)) {
      throw new AppError('Invalid booking status transition', 400);
    }

    let createdEvent = null;

    if (value.status === 'approved') {
      const endTime = calculateEndTime(
        booking.preferred_time.slice(0, 5),
        booking.duration_hours
      );

      const result = await withTransaction(async (client) => {
        const updatedBookingResult = await client.query(
          `UPDATE bookings
           SET status = 'approved',
               updated_at = NOW()
           WHERE id = $1 AND tenant_id = $2
           RETURNING *`,
          [req.params.id, req.tenantId]
        );

        const eventResult = await client.query(
          `INSERT INTO events (
             tenant_id, booking_id, event_date, start_time,
             end_time, status, approved_by
           )
           VALUES ($1, $2, $3, $4, $5, 'upcoming', $6)
           RETURNING *`,
          [
            req.tenantId,
            booking.id,
            booking.preferred_date,
            booking.preferred_time,
            endTime,
            req.user.id,
          ]
        );

        await client.query(
          `INSERT INTO audit_log (
             actor_id, actor_email, tenant_id, action,
             resource, resource_id, metadata
           )
           VALUES ($1, $2, $3, 'BOOKING_APPROVED', 'booking', $4, $5)`,
          [
            req.user.id,
            req.user.email,
            req.tenantId,
            booking.id,
            JSON.stringify({
              previous_status: booking.status,
              new_status: 'approved',
            }),
          ]
        );

        return {
          booking: updatedBookingResult.rows[0],
          event: eventResult.rows[0],
        };
      });

      createdEvent = result.event;
    } else {
      await query(
        `UPDATE bookings
         SET status = $1,
             updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [value.status, req.params.id, req.tenantId]
      );
    }

    const updatedBooking = await getBookingDetails(req.params.id, req.tenantId);

    return res.status(200).json({
      success: true,
      booking: updatedBooking,
      event: createdEvent,
    });
  } catch (error) {
    next(error);
  }
}

async function toggleActive(req, res, next) {
  try {
    const booking = await getOwnedBooking(req.params.id, req.tenantId);

    if (!booking) {
      throw new AppError('Booking not found', 404);
    }

    const result = await query(
      `UPDATE bookings
       SET is_active = $1,
           updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING is_active`,
      [!booking.is_active, req.params.id, req.tenantId]
    );

    return res.status(200).json({
      success: true,
      is_active: result.rows[0].is_active,
    });
  } catch (error) {
    next(error);
  }
}

async function updatePayment(req, res, next) {
  try {
    const booking = await getOwnedBooking(req.params.id, req.tenantId);

    if (!booking) {
      throw new AppError('Booking not found', 404);
    }

    const { value, error } = validate(updatePaymentSchema, req.body);

    if (error) {
      return next(error);
    }

    if (value.amount_paid > Number(booking.amount_due)) {
      throw new AppError('amount_paid cannot be greater than amount_due', 400);
    }

    await query(
      `UPDATE bookings
       SET payment_status = $1,
           amount_paid = $2,
           updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4`,
      [value.payment_status, value.amount_paid, req.params.id, req.tenantId]
    );

    const updatedBooking = await getBookingDetails(req.params.id, req.tenantId);

    return res.status(200).json({
      success: true,
      booking: updatedBooking,
    });
  } catch (error) {
    next(error);
  }
}

async function deleteBooking(req, res, next) {
  try {
    const booking = await getOwnedBooking(req.params.id, req.tenantId);

    if (!booking) {
      throw new AppError('Booking not found', 404);
    }

    const eventResult = await query(
      `SELECT id, status
       FROM events
       WHERE booking_id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenantId]
    );
    const event = eventResult.rows[0];

    if (event?.status === 'ongoing') {
      throw new AppError(
        'Bookings with ongoing events cannot be deleted',
        400
      );
    }

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO audit_log (
           actor_id, actor_email, tenant_id, action,
           resource, resource_id, metadata
         )
         VALUES ($1, $2, $3, 'BOOKING_DELETED', 'booking', $4, $5)`,
        [
          req.user.id,
          req.user.email,
          req.tenantId,
          req.params.id,
          JSON.stringify({
            status: booking.status,
            event_id: event?.id,
            event_status: event?.status,
          }),
        ]
      );

      await client.query(
        'DELETE FROM bookings WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      );
    });

    return res.status(200).json({
      success: true,
      message: 'Booking and related event deleted',
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAllBookings,
  getBookingById,
  createBooking,
  updateBooking,
  updateBookingStatus,
  toggleActive,
  updatePayment,
  deleteBooking,
};
