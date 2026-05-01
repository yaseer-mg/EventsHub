const Joi = require('joi');

const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const {
  stripe,
  CLIENT_URL,
  getOrCreateStripeCustomer,
  retrieveSubscription,
  constructWebhookEvent,
  getPlanPriceId,
} = require('../services/stripeService');

const checkoutSchema = Joi.object({
  plan: Joi.string().valid('pro', 'enterprise').required(),
});

function validate(schema, payload) {
  return schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
  });
}

function fromUnixTimestamp(value) {
  return value ? new Date(value * 1000).toISOString() : null;
}

function formatLimitValue(value, label) {
  if (value === -1) {
    return `Unlimited ${label}`;
  }

  return `${value} ${label}`;
}

function buildPlanFeatures(plan) {
  return [
    formatLimitValue(plan.max_bookings_per_month, 'bookings / month'),
    formatLimitValue(plan.max_events_per_month, 'approved events / month'),
    formatLimitValue(plan.max_attendees_per_event, 'attendees / event'),
    formatLimitValue(plan.max_team_members, 'team members'),
    formatLimitValue(plan.max_halls, 'halls'),
    plan.can_custom_branding ? 'Custom branding' : 'No custom branding',
    plan.can_export_reports ? 'Export reports' : 'No report exports',
    plan.can_api_access ? 'API access' : 'No API access',
  ];
}

async function getSubscriptionForTenant(tenantId, db = { query }) {
  const result = await db.query(
    `SELECT *
     FROM subscriptions
     WHERE tenant_id = $1`,
    [tenantId]
  );

  return result.rows[0] || null;
}

function mapStripeStatusToTenantPlanStatus(status) {
  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'cancelled':
      return 'cancelled';
    default:
      return 'suspended';
  }
}

async function syncSubscriptionRecord({
  tenantId,
  plan,
  stripeCustomerId,
  stripeSubscriptionId,
  stripePriceId,
  status,
  currentPeriodStart,
  currentPeriodEnd,
  cancelAtPeriodEnd = false,
  cancelledAt = null,
  db = { query },
}) {
  await db.query(
    `INSERT INTO subscriptions (
       tenant_id, stripe_subscription_id, stripe_price_id,
       plan, status, current_period_start, current_period_end,
       cancel_at_period_end, cancelled_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (tenant_id)
     DO UPDATE SET
       stripe_subscription_id = EXCLUDED.stripe_subscription_id,
       stripe_price_id = EXCLUDED.stripe_price_id,
       plan = EXCLUDED.plan,
       status = EXCLUDED.status,
       current_period_start = EXCLUDED.current_period_start,
       current_period_end = EXCLUDED.current_period_end,
       cancel_at_period_end = EXCLUDED.cancel_at_period_end,
       cancelled_at = EXCLUDED.cancelled_at,
       updated_at = NOW()`,
    [
      tenantId,
      stripeSubscriptionId,
      stripePriceId,
      plan,
      status,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      cancelledAt,
    ]
  );

  await db.query(
    `UPDATE tenants
     SET plan = $1,
         plan_status = $2,
         stripe_customer_id = COALESCE($3, stripe_customer_id),
         updated_at = NOW()
     WHERE id = $4`,
    [plan, mapStripeStatusToTenantPlanStatus(status), stripeCustomerId, tenantId]
  );
}

async function getTenantIdBySubscriptionId(subscriptionId, db = { query }) {
  const result = await db.query(
    `SELECT tenant_id
     FROM subscriptions
     WHERE stripe_subscription_id = $1`,
    [subscriptionId]
  );

  return result.rows[0]?.tenant_id || null;
}

async function getPlans(req, res, next) {
  try {
    const result = await query(
      `SELECT *
       FROM plan_limits
       ORDER BY price_monthly_ngn ASC`
    );

    const plans = result.rows.map((plan) => ({
      plan: plan.plan,
      price_monthly_ngn: Number(plan.price_monthly_ngn),
      stripe_price_id: plan.stripe_price_id || getPlanPriceId(plan.plan),
      limits: {
        max_bookings_per_month: plan.max_bookings_per_month,
        max_events_per_month: plan.max_events_per_month,
        max_attendees_per_event: plan.max_attendees_per_event,
        max_team_members: plan.max_team_members,
        max_halls: plan.max_halls,
      },
      capabilities: {
        can_export_reports: plan.can_export_reports,
        can_custom_branding: plan.can_custom_branding,
        can_api_access: plan.can_api_access,
      },
      features: buildPlanFeatures(plan),
    }));

    return res.status(200).json({
      success: true,
      plans,
    });
  } catch (error) {
    next(error);
  }
}

async function getBillingInfo(req, res, next) {
  try {
    const [subscriptionResult, tenantResult] = await Promise.all([
      query(
        `SELECT *
         FROM subscriptions
         WHERE tenant_id = $1`,
        [req.tenantId]
      ),
      query(
        `SELECT id, business_name, email, plan, plan_status,
                stripe_customer_id, trial_ends_at, created_at, updated_at
         FROM tenants
         WHERE id = $1`,
        [req.tenantId]
      ),
    ]);

    const tenant = tenantResult.rows[0];

    if (!tenant) {
      throw new AppError('Tenant not found', 404);
    }

    let invoices = [];

    if (tenant.stripe_customer_id) {
      try {
        const invoiceResult = await stripe.invoices.list({
          customer: tenant.stripe_customer_id,
          limit: 5,
        });

        invoices = invoiceResult.data;
      } catch (stripeError) {
        console.error('Failed to fetch Stripe invoices:', stripeError.message);
      }
    }

    return res.status(200).json({
      success: true,
      subscription: subscriptionResult.rows[0] || null,
      tenant,
      invoices,
    });
  } catch (error) {
    next(error);
  }
}

async function createCheckoutSession(req, res, next) {
  try {
    const { value, error } = validate(checkoutSchema, req.body);

    if (error) {
      return next(error);
    }

    const planResult = await query(
      `SELECT plan, stripe_price_id
       FROM plan_limits
       WHERE plan = $1`,
      [value.plan]
    );

    const planRow = planResult.rows[0];

    if (!planRow) {
      throw new AppError('Plan not found', 404);
    }

    const priceId = planRow.stripe_price_id || getPlanPriceId(value.plan);

    if (!priceId) {
      throw new AppError(`Stripe price ID is not configured for ${value.plan}`, 500);
    }

    const customerId = await getOrCreateStripeCustomer(req.tenant);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${CLIENT_URL}/settings/billing?success=true`,
      cancel_url: `${CLIENT_URL}/settings/billing?cancelled=true`,
      metadata: { tenant_id: req.tenantId, plan: value.plan },
      subscription_data: {
        metadata: { tenant_id: req.tenantId },
      },
    });

    return res.status(200).json({
      success: true,
      checkout_url: session.url,
    });
  } catch (error) {
    next(error);
  }
}

async function createPortalSession(req, res, next) {
  try {
    if (!req.tenant.stripe_customer_id) {
      throw new AppError('No Stripe customer found for this tenant', 400);
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: req.tenant.stripe_customer_id,
      return_url: `${CLIENT_URL}/settings/billing`,
    });

    return res.status(200).json({
      success: true,
      portal_url: session.url,
    });
  } catch (error) {
    next(error);
  }
}

async function handleWebhook(req, res, next) {
  let event;

  try {
    event = constructWebhookEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: `Webhook Error: ${error.message}`,
    });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const tenantId = session.metadata?.tenant_id;
        const plan = session.metadata?.plan;

        if (!tenantId || !plan || !session.subscription) {
          break;
        }

        const subscription = await retrieveSubscription(session.subscription);
        const stripePriceId = subscription.items.data[0]?.price?.id || null;

        await syncSubscriptionRecord({
          tenantId,
          plan,
          stripeCustomerId: session.customer,
          stripeSubscriptionId: subscription.id,
          stripePriceId,
          status: 'active',
          currentPeriodStart: fromUnixTimestamp(
            subscription.current_period_start
          ),
          currentPeriodEnd: fromUnixTimestamp(subscription.current_period_end),
          cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
          cancelledAt: fromUnixTimestamp(subscription.canceled_at),
        });
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const tenantId = await getTenantIdBySubscriptionId(invoice.subscription);

        if (!tenantId) {
          break;
        }

        await query(
          `UPDATE subscriptions
           SET status = 'active',
               current_period_end = COALESCE($1, current_period_end),
               updated_at = NOW()
           WHERE stripe_subscription_id = $2`,
          [
            fromUnixTimestamp(invoice.lines?.data?.[0]?.period?.end),
            invoice.subscription,
          ]
        );

        await query(
          `UPDATE tenants
           SET plan_status = 'active',
               updated_at = NOW()
           WHERE id = $1`,
          [tenantId]
        );
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const tenantId = await getTenantIdBySubscriptionId(invoice.subscription);

        if (!tenantId) {
          break;
        }

        await query(
          `UPDATE tenants
           SET plan_status = 'past_due',
               updated_at = NOW()
           WHERE id = $1`,
          [tenantId]
        );

        await query(
          `UPDATE subscriptions
           SET status = 'past_due',
               updated_at = NOW()
           WHERE stripe_subscription_id = $1`,
          [invoice.subscription]
        );
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const tenantId =
          subscription.metadata?.tenant_id ||
          (await getTenantIdBySubscriptionId(subscription.id));

        if (!tenantId) {
          break;
        }

        await query(
          `UPDATE tenants
           SET plan = 'free',
               plan_status = 'cancelled',
               updated_at = NOW()
           WHERE id = $1`,
          [tenantId]
        );

        await query(
          `UPDATE subscriptions
           SET status = 'cancelled',
               cancelled_at = NOW(),
               cancel_at_period_end = false,
               updated_at = NOW()
           WHERE stripe_subscription_id = $1`,
          [subscription.id]
        );
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const tenantId =
          subscription.metadata?.tenant_id ||
          (await getTenantIdBySubscriptionId(subscription.id));

        if (!tenantId) {
          break;
        }

        const existingSubscription = await getSubscriptionForTenant(tenantId);
        const existingPlan = existingSubscription?.plan || 'free';
        const stripePriceId = subscription.items.data[0]?.price?.id || null;

        await syncSubscriptionRecord({
          tenantId,
          plan: existingPlan,
          stripeCustomerId:
            typeof subscription.customer === 'string'
              ? subscription.customer
              : subscription.customer?.id,
          stripeSubscriptionId: subscription.id,
          stripePriceId,
          status: subscription.status,
          currentPeriodStart: fromUnixTimestamp(
            subscription.current_period_start
          ),
          currentPeriodEnd: fromUnixTimestamp(subscription.current_period_end),
          cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
          cancelledAt: fromUnixTimestamp(subscription.canceled_at),
        });
        break;
      }

      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getPlans,
  getBillingInfo,
  createCheckoutSession,
  createPortalSession,
  handleWebhook,
  getBilling: getBillingInfo,
  createCheckout: createCheckoutSession,
  createPortal: createPortalSession,
};
