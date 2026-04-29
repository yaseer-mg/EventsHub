const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Joi = require('joi');

const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { uploadImage } = require('../services/cloudinaryService');
const { sendInvitationEmail } = require('../services/emailService');

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const HEX_COLOR_REGEX = /^#([A-Fa-f0-9]{6})$/;
const ALLOWED_LOGO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;

const businessInfoSchema = Joi.object({
  business_name: Joi.string().min(2).optional(),
  phone: Joi.string().optional().allow('', null),
  address: Joi.string().optional().allow('', null),
  city: Joi.string().optional().allow('', null),
  state: Joi.string().optional().allow('', null),
  website: Joi.string().uri().optional().allow('', null),
})
  .min(1)
  .required();

const uploadLogoSchema = Joi.object({
  image_base64: Joi.string().required(),
  mime_type: Joi.string()
    .valid(...ALLOWED_LOGO_MIME_TYPES)
    .required(),
});

const updateBrandingSchema = Joi.object({
  primary_color: Joi.string().pattern(HEX_COLOR_REGEX).required(),
});

const updateProfileSchema = Joi.object({
  full_name: Joi.string().min(2).max(255).optional(),
  avatar_url: Joi.string().uri().optional().allow('', null),
})
  .min(1)
  .required();

const changePasswordSchema = Joi.object({
  current_password: Joi.string().required(),
  new_password: Joi.string().pattern(PASSWORD_REGEX).required().messages({
    'string.pattern.base':
      'Password must contain at least 1 lowercase letter, 1 uppercase letter, and 1 digit',
  }),
  confirm_password: Joi.string().required(),
});

const inviteTeamMemberSchema = Joi.object({
  email: Joi.string().email().required(),
  role: Joi.string().valid('manager', 'staff').required(),
});

const acceptInvitationSchema = Joi.object({
  token: Joi.string().required(),
  full_name: Joi.string().min(2).max(255).required(),
  password: Joi.string().pattern(PASSWORD_REGEX).required().messages({
    'string.pattern.base':
      'Password must contain at least 1 lowercase letter, 1 uppercase letter, and 1 digit',
  }),
});

const updateTeamMemberSchema = Joi.object({
  role: Joi.string().valid('owner', 'manager', 'staff').optional(),
  is_active: Joi.boolean().optional(),
})
  .min(1)
  .required();

const notificationPrefsSchema = Joi.object({
  email_new_booking: Joi.boolean().optional(),
  email_payment_received: Joi.boolean().optional(),
  email_event_reminder: Joi.boolean().optional(),
  email_low_usage_alert: Joi.boolean().optional(),
})
  .min(1)
  .required();

function validate(schema, payload) {
  return schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
  });
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function getBase64SizeBytes(base64String) {
  const cleaned = String(base64String).includes(',')
    ? String(base64String).split(',')[1]
    : String(base64String);

  return Buffer.byteLength(cleaned, 'base64');
}

async function getFreshTenant(tenantId, db = { query }) {
  const result = await db.query('SELECT * FROM tenants WHERE id = $1', [tenantId]);
  return result.rows[0] || null;
}

async function getTeamMemberById(userId, tenantId, db = { query }) {
  const result = await db.query(
    `SELECT id, tenant_id, full_name, email, role, avatar_url,
            is_active, last_login_at, created_at
     FROM users
     WHERE id = $1 AND tenant_id = $2`,
    [userId, tenantId]
  );

  return result.rows[0] || null;
}

async function getSettings(req, res, next) {
  try {
    const [tenantResult, userResult, planResult, usageResult] = await Promise.all([
      query('SELECT * FROM tenants WHERE id = $1', [req.tenantId]),
      query(
        `SELECT id, tenant_id, full_name, email, role, avatar_url,
                is_active, is_verified, onboarding_complete,
                last_login_at, created_at, updated_at
         FROM users
         WHERE id = $1`,
        [req.user.id]
      ),
      query('SELECT * FROM plan_limits WHERE plan = $1', [req.tenant.plan]),
      query(
        `SELECT
            (SELECT COUNT(*)::int
             FROM bookings
             WHERE tenant_id = $1
               AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
            ) AS bookings_this_month,
            (SELECT COUNT(*)::int
             FROM events
             WHERE tenant_id = $1
               AND DATE_TRUNC('month', approved_at) = DATE_TRUNC('month', NOW())
            ) AS events_this_month,
            (SELECT COUNT(*)::int
             FROM users
             WHERE tenant_id = $1
               AND is_active = true
            ) AS team_members,
            (SELECT COUNT(*)::int
             FROM halls
             WHERE tenant_id = $1
            ) AS halls`,
        [req.tenantId]
      ),
    ]);

    const tenant = tenantResult.rows[0];
    const user = userResult.rows[0];
    const plan = planResult.rows[0];
    const usage = usageResult.rows[0];

    if (!tenant) {
      throw new AppError('Tenant not found', 404);
    }

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (!plan) {
      throw new AppError('Plan limits not found', 404);
    }

    return res.status(200).json({
      success: true,
      tenant,
      user,
      plan,
      usage,
    });
  } catch (error) {
    next(error);
  }
}

async function updateBusinessInfo(req, res, next) {
  try {
    const { value, error } = validate(businessInfoSchema, req.body);

    if (error) {
      return next(error);
    }

    const fields = [];
    const values = [];
    let index = 1;

    for (const [key, fieldValue] of Object.entries(value)) {
      fields.push(`${key} = $${index}`);
      values.push(fieldValue || null);
      index += 1;
    }

    fields.push('updated_at = NOW()');
    values.push(req.tenantId);

    const result = await query(
      `UPDATE tenants
       SET ${fields.join(', ')}
       WHERE id = $${index}
       RETURNING *`,
      values
    );

    return res.status(200).json({
      success: true,
      tenant: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

async function uploadLogo(req, res, next) {
  try {
    const { value, error } = validate(uploadLogoSchema, req.body);

    if (error) {
      return next(error);
    }

    if (getBase64SizeBytes(value.image_base64) >= MAX_LOGO_SIZE_BYTES) {
      throw new AppError('Logo image must be smaller than 2MB', 400);
    }

    const uploaded = await uploadImage(value.image_base64, 'logos', req.tenantId);

    await query(
      `UPDATE tenants
       SET logo_url = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [uploaded.url, req.tenantId]
    );

    return res.status(200).json({
      success: true,
      logo_url: uploaded.url,
    });
  } catch (error) {
    next(error);
  }
}

async function updateBranding(req, res, next) {
  try {
    const { value, error } = validate(updateBrandingSchema, req.body);

    if (error) {
      return next(error);
    }

    await query(
      `UPDATE tenants
       SET primary_color = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [value.primary_color, req.tenantId]
    );

    return res.status(200).json({
      success: true,
      primary_color: value.primary_color,
    });
  } catch (error) {
    next(error);
  }
}

async function updateProfile(req, res, next) {
  try {
    const { value, error } = validate(updateProfileSchema, req.body);

    if (error) {
      return next(error);
    }

    const fields = [];
    const values = [];
    let index = 1;

    for (const [key, fieldValue] of Object.entries(value)) {
      fields.push(`${key} = $${index}`);
      values.push(fieldValue || null);
      index += 1;
    }

    fields.push('updated_at = NOW()');
    values.push(req.user.id);

    const result = await query(
      `UPDATE users
       SET ${fields.join(', ')}
       WHERE id = $${index}
       RETURNING id, tenant_id, full_name, email, role, avatar_url,
                 is_active, is_verified, onboarding_complete,
                 last_login_at, created_at, updated_at`,
      values
    );

    return res.status(200).json({
      success: true,
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

async function changePassword(req, res, next) {
  try {
    const { value, error } = validate(changePasswordSchema, req.body);

    if (error) {
      return next(error);
    }

    if (value.new_password !== value.confirm_password) {
      throw new AppError('New password and confirm password must match', 400);
    }

    const result = await query(
      'SELECT id, password_hash FROM users WHERE id = $1',
      [req.user.id]
    );

    const user = result.rows[0];

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const matches = await bcrypt.compare(
      value.current_password,
      user.password_hash
    );

    if (!matches) {
      throw new AppError('Current password is incorrect', 400);
    }

    const passwordHash = await bcrypt.hash(
      value.new_password,
      Number(process.env.BCRYPT_ROUNDS || 12)
    );

    await query(
      `UPDATE users
       SET password_hash = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, req.user.id]
    );

    return res.status(200).json({
      success: true,
      message: 'Password updated',
    });
  } catch (error) {
    next(error);
  }
}

async function getTeamMembers(req, res, next) {
  try {
    const [membersResult, invitationsResult] = await Promise.all([
      query(
        `SELECT id, full_name, email, role, avatar_url,
                is_active, last_login_at, created_at
         FROM users
         WHERE tenant_id = $1
         ORDER BY created_at ASC`,
        [req.tenantId]
      ),
      query(
        `SELECT *
         FROM invitations
         WHERE tenant_id = $1
           AND accepted = false
           AND expires_at > NOW()
         ORDER BY created_at ASC`,
        [req.tenantId]
      ),
    ]);

    return res.status(200).json({
      success: true,
      members: membersResult.rows,
      pendingInvitations: invitationsResult.rows,
    });
  } catch (error) {
    next(error);
  }
}

async function inviteTeamMember(req, res, next) {
  try {
    const { value, error } = validate(inviteTeamMemberSchema, req.body);

    if (error) {
      return next(error);
    }

    const email = normalizeEmail(value.email);

    const existingUserResult = await query(
      'SELECT id FROM users WHERE tenant_id = $1 AND email = $2',
      [req.tenantId, email]
    );

    if (existingUserResult.rows.length > 0) {
      throw new AppError('A team member with this email already exists', 409);
    }

    const pendingInvitationResult = await query(
      `SELECT id
       FROM invitations
       WHERE tenant_id = $1
         AND email = $2
         AND accepted = false
         AND expires_at > NOW()`,
      [req.tenantId, email]
    );

    if (pendingInvitationResult.rows.length > 0) {
      throw new AppError('A pending invitation already exists for this email', 409);
    }

    const token = crypto.randomBytes(32).toString('hex');

    await query(
      `INSERT INTO invitations (
         tenant_id, invited_by, email, role, token, expires_at
       )
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '48 hours')`,
      [req.tenantId, req.user.id, email, value.role, token]
    );

    await sendInvitationEmail(
      email,
      req.user.full_name,
      req.tenant.business_name,
      value.role,
      token
    );

    return res.status(201).json({
      success: true,
      message: 'Invitation sent',
    });
  } catch (error) {
    next(error);
  }
}

async function acceptInvitation(req, res, next) {
  try {
    const { value, error } = validate(acceptInvitationSchema, req.body);

    if (error) {
      return next(error);
    }

    const invitationResult = await query(
      `SELECT *
       FROM invitations
       WHERE token = $1
         AND accepted = false
         AND expires_at > NOW()`,
      [value.token]
    );

    const invitation = invitationResult.rows[0];

    if (!invitation) {
      throw new AppError('Invitation expired or invalid', 400);
    }

    const existingUserResult = await query(
      'SELECT id FROM users WHERE email = $1',
      [invitation.email]
    );

    if (existingUserResult.rows.length > 0) {
      throw new AppError('An account already exists for this email', 409);
    }

    const passwordHash = await bcrypt.hash(
      value.password,
      Number(process.env.BCRYPT_ROUNDS || 12)
    );

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO users (
           tenant_id, full_name, email, password_hash, role,
           is_verified, onboarding_complete
         )
         VALUES ($1, $2, $3, $4, $5, true, true)`,
        [
          invitation.tenant_id,
          value.full_name,
          invitation.email,
          passwordHash,
          invitation.role,
        ]
      );

      await client.query(
        `UPDATE invitations
         SET accepted = true
         WHERE id = $1`,
        [invitation.id]
      );
    });

    return res.status(201).json({
      success: true,
      message: 'Account created. Please login.',
    });
  } catch (error) {
    next(error);
  }
}

async function updateTeamMember(req, res, next) {
  try {
    const { value, error } = validate(updateTeamMemberSchema, req.body);

    if (error) {
      return next(error);
    }

    const member = await getTeamMemberById(req.params.userId, req.tenantId);

    if (!member) {
      throw new AppError('Team member not found', 404);
    }

    if (req.params.userId === req.user.id && value.role) {
      throw new AppError('You cannot update your own role', 400);
    }

    const fields = [];
    const values = [];
    let index = 1;

    for (const [key, fieldValue] of Object.entries(value)) {
      fields.push(`${key} = $${index}`);
      values.push(fieldValue);
      index += 1;
    }

    fields.push('updated_at = NOW()');
    values.push(req.params.userId, req.tenantId);

    const result = await query(
      `UPDATE users
       SET ${fields.join(', ')}
       WHERE id = $${index} AND tenant_id = $${index + 1}
       RETURNING id, full_name, email, role, avatar_url,
                 is_active, last_login_at, created_at`,
      values
    );

    return res.status(200).json({
      success: true,
      member: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

async function removeTeamMember(req, res, next) {
  try {
    if (req.params.userId === req.user.id) {
      throw new AppError('You cannot remove yourself', 400);
    }

    const member = await getTeamMemberById(req.params.userId, req.tenantId);

    if (!member) {
      throw new AppError('Team member not found', 404);
    }

    if (member.role === 'owner' && member.is_active) {
      const ownerCountResult = await query(
        `SELECT COUNT(*)::int AS count
         FROM users
         WHERE tenant_id = $1
           AND role = 'owner'
           AND is_active = true`,
        [req.tenantId]
      );

      if (ownerCountResult.rows[0].count <= 1) {
        throw new AppError('Cannot remove the only owner', 400);
      }
    }

    await query(
      `UPDATE users
       SET is_active = false,
           updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [req.params.userId, req.tenantId]
    );

    return res.status(200).json({
      success: true,
      message: 'Team member deactivated',
    });
  } catch (error) {
    next(error);
  }
}

async function updateNotifications(req, res, next) {
  try {
    const { value, error } = validate(notificationPrefsSchema, req.body);

    if (error) {
      return next(error);
    }

    const tenant = await getFreshTenant(req.tenantId);

    if (!tenant) {
      throw new AppError('Tenant not found', 404);
    }

    const nextPrefs = {
      ...(tenant.notification_prefs || {}),
      ...value,
    };

    await query(
      `UPDATE tenants
       SET notification_prefs = $1::jsonb,
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(nextPrefs), req.tenantId]
    );

    return res.status(200).json({
      success: true,
      notification_prefs: nextPrefs,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getSettings,
  updateBusinessInfo,
  uploadLogo,
  updateBranding,
  updateProfile,
  changePassword,
  getTeamMembers,
  inviteTeamMember,
  acceptInvitation,
  updateTeamMember,
  removeTeamMember,
  updateNotifications,
};
