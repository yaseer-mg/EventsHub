const Joi = require('joi');

const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const {
  generateQRToken,
  generateQRDataURL,
} = require('../services/qrService');

const attendeeInputSchema = Joi.object({
  full_name: Joi.string().trim().max(255).required(),
  seat_number: Joi.string().trim().max(50).required(),
  tag: Joi.string().trim().max(100).optional().allow('', null),
  pass_template: Joi.string().trim().max(80).optional().allow('', null),
  pass_details: Joi.object().unknown(true).optional().allow(null),
});

const bulkCreateAttendeesSchema = Joi.object({
  attendees: Joi.array().items(attendeeInputSchema).min(1).required(),
});

function validate(schema, payload) {
  return schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
  });
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  return null;
}

function getTodayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

async function getOwnedEvent(eventId, tenantId, db = { query }) {
  const result = await db.query(
    `SELECT e.*, b.guest_count, b.payment_status, b.event_name
     FROM events e
     JOIN bookings b ON e.booking_id = b.id
     WHERE e.id = $1 AND e.tenant_id = $2`,
    [eventId, tenantId]
  );

  return result.rows[0] || null;
}

async function getPlanLimits(plan) {
  const result = await query('SELECT * FROM plan_limits WHERE plan = $1', [plan]);
  return result.rows[0] || null;
}

async function bulkCreateAttendees(req, res, next) {
  try {
    const event = await getOwnedEvent(req.params.id, req.tenantId);

    if (!event) {
      throw new AppError('Event not found', 404);
    }

    if (event.payment_status !== 'paid') {
      throw new AppError(
        'Payment must be completed before generating gate passes',
        400
      );
    }

    const { value, error } = validate(bulkCreateAttendeesSchema, req.body);

    if (error) {
      return next(error);
    }

    const planLimits = await getPlanLimits(req.tenant.plan);

    if (!planLimits) {
      throw new AppError('Plan limits not found', 404);
    }

    const count = value.attendees.length;
    const normalizedSeats = value.attendees.map((attendee) =>
      attendee.seat_number.trim().toLowerCase()
    );
    const uniqueSeats = new Set(normalizedSeats);

    if (uniqueSeats.size !== normalizedSeats.length) {
      throw new AppError('Each gate pass must have a unique seat number', 400);
    }

    if (
      planLimits.max_attendees_per_event !== -1 &&
      count > planLimits.max_attendees_per_event
    ) {
      throw new AppError(
        `Attendee limit exceeded for your ${req.tenant.plan} plan`,
        400
      );
    }

    const existingResult = await query(
      `SELECT COUNT(*)::int AS count
       FROM attendees
       WHERE event_id = $1`,
      [req.params.id]
    );

    if (existingResult.rows[0].count > 0) {
      throw new AppError(
        'Gate passes already generated. Delete existing to regenerate.',
        400
      );
    }

    await withTransaction(async (client) => {
      for (const attendee of value.attendees) {
        const token = generateQRToken({
          eventName: event.event_name,
          tag: attendee.tag,
        });

        await client.query(
          `INSERT INTO attendees (
             tenant_id, event_id, full_name, seat_number, tag,
             pass_template, pass_details, qr_token
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            req.tenantId,
            req.params.id,
            attendee.full_name,
            attendee.seat_number.trim(),
            attendee.tag || null,
            attendee.pass_template || null,
            attendee.pass_details || null,
            token,
          ]
        );
      }

      await client.query(
        `UPDATE events
         SET total_attendees = $1
         WHERE id = $2 AND tenant_id = $3`,
        [count, req.params.id, req.tenantId]
      );
    });

    return res.status(201).json({
      success: true,
      message: `${count} gate passes created`,
      total: count,
    });
  } catch (error) {
    next(error);
  }
}

async function getEventAttendees(req, res, next) {
  try {
    const event = await getOwnedEvent(req.params.id, req.tenantId);

    if (!event) {
      throw new AppError('Event not found', 404);
    }

    const checkedInFilter = req.query.checked_in
      ? normalizeBoolean(req.query.checked_in)
      : null;
    const search = req.query.search ? String(req.query.search).trim() : '';

    if (req.query.checked_in && checkedInFilter === null) {
      throw new AppError('checked_in must be true or false', 400);
    }

    const conditions = ['event_id = $1'];
    const values = [req.params.id];
    let index = 2;

    if (checkedInFilter !== null) {
      conditions.push(`checked_in = $${index}`);
      values.push(checkedInFilter);
      index += 1;
    }

    if (search) {
      conditions.push(`(
        full_name ILIKE $${index}
        OR seat_number ILIKE $${index}
        OR tag ILIKE $${index}
      )`);
      values.push(`%${search}%`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const attendeesResult = await query(
      `SELECT *
       FROM attendees
       ${whereClause}
       ORDER BY seat_number ASC NULLS LAST, full_name ASC`,
      values
    );

    const statsResult = await query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(
                SUM(CASE WHEN checked_in THEN 1 ELSE 0 END),
                0
              )::int AS checked_in_count
       FROM attendees
       WHERE event_id = $1`,
      [req.params.id]
    );

    const stats = statsResult.rows[0];

    return res.status(200).json({
      success: true,
      attendees: attendeesResult.rows,
      stats: {
        total: stats.total,
        checked_in_count: stats.checked_in_count,
        not_checked_in_count: stats.total - stats.checked_in_count,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getAttendeePass(req, res, next) {
  try {
    const result = await query(
      `SELECT a.*,
              e.event_date,
              e.start_time,
              e.end_time,
              b.event_name,
              b.event_type,
              h.name AS hall_name,
              t.business_name,
              t.logo_url,
              t.primary_color
       FROM attendees a
       JOIN events e ON a.event_id = e.id
       JOIN bookings b ON e.booking_id = b.id
       LEFT JOIN halls h ON b.hall_id = h.id
       JOIN tenants t ON a.tenant_id = t.id
       WHERE a.id = $1 AND a.tenant_id = $2`,
      [req.params.id, req.tenantId]
    );

    const attendeeRecord = result.rows[0];

    if (!attendeeRecord) {
      throw new AppError('Attendee not found', 404);
    }

    const qr_image = await generateQRDataURL(attendeeRecord.qr_token);

    return res.status(200).json({
      success: true,
      attendee: {
        id: attendeeRecord.id,
        event_id: attendeeRecord.event_id,
        full_name: attendeeRecord.full_name,
        seat_number: attendeeRecord.seat_number,
        tag: attendeeRecord.tag,
        pass_template: attendeeRecord.pass_template,
        pass_details: attendeeRecord.pass_details,
        qr_token: attendeeRecord.qr_token,
        checked_in: attendeeRecord.checked_in,
        checked_in_at: attendeeRecord.checked_in_at,
        created_at: attendeeRecord.created_at,
      },
      event: {
        event_date: attendeeRecord.event_date,
        start_time: attendeeRecord.start_time,
        end_time: attendeeRecord.end_time,
        event_name: attendeeRecord.event_name,
        event_type: attendeeRecord.event_type,
        hall_name: attendeeRecord.hall_name,
      },
      tenant: {
        business_name: attendeeRecord.business_name,
        logo_url: attendeeRecord.logo_url,
        primary_color: attendeeRecord.primary_color,
      },
      qr_image,
    });
  } catch (error) {
    next(error);
  }
}

async function scanQR(req, res, next) {
  try {
    const result = await query(
      `SELECT a.*,
              e.event_date,
              e.status AS event_status,
              e.id AS event_id,
              b.event_name,
              t.business_name
       FROM attendees a
       JOIN events e ON a.event_id = e.id
       JOIN bookings b ON e.booking_id = b.id
       JOIN tenants t ON a.tenant_id = t.id
       WHERE a.qr_token = $1`,
      [req.params.token]
    );

    const attendee = result.rows[0];

    if (!attendee) {
      return res.status(404).json({
        valid: false,
        message: 'Invalid QR code',
      });
    }

    if (attendee.event_status === 'cancelled') {
      return res.status(400).json({
        valid: false,
        message: 'This event was cancelled',
      });
    }

    const today = getTodayDateOnly();

    if (attendee.event_date.toISOString().slice(0, 10) !== today) {
      return res.status(400).json({
        valid: false,
        message: 'This pass is not valid today',
        valid_date: attendee.event_date,
      });
    }

    if (attendee.checked_in) {
      return res.status(409).json({
        valid: false,
        message: 'Already checked in',
        checked_in_at: attendee.checked_in_at,
      });
    }

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE attendees
         SET checked_in = true,
             checked_in_at = NOW()
         WHERE id = $1`,
        [attendee.id]
      );

      await client.query(
        `UPDATE events
         SET check_in_count = check_in_count + 1
         WHERE id = $1`,
        [attendee.event_id]
      );
    });

    return res.status(200).json({
      valid: true,
      attendee: {
        full_name: attendee.full_name,
        seat_number: attendee.seat_number,
        tag: attendee.tag,
      },
      event: {
        event_name: attendee.event_name,
        event_date: attendee.event_date,
        business_name: attendee.business_name,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function deleteEventAttendees(req, res, next) {
  try {
    const event = await getOwnedEvent(req.params.id, req.tenantId);

    if (!event) {
      throw new AppError('Event not found', 404);
    }

    if (event.status !== 'upcoming') {
      throw new AppError('Attendees can only be cleared for upcoming events', 400);
    }

    await withTransaction(async (client) => {
      await client.query(
        `DELETE FROM attendees
         WHERE event_id = $1 AND tenant_id = $2`,
        [req.params.id, req.tenantId]
      );

      await client.query(
        `UPDATE events
         SET total_attendees = 0,
             check_in_count = 0
         WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, req.tenantId]
      );
    });

    return res.status(200).json({
      success: true,
      message: 'Attendees cleared',
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  bulkCreateAttendees,
  getEventAttendees,
  getAttendeePass,
  scanQR,
  deleteEventAttendees,
};
