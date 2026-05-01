const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const { query } = require('../config/db');

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const PLAN_PRICE_ID_MAP = {
  pro: process.env.STRIPE_PRO_PRICE_ID,
  enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID,
};

function getPlanPriceId(plan) {
  return PLAN_PRICE_ID_MAP[plan] || null;
}

function getPlanFromPriceId(priceId) {
  const entry = Object.entries(PLAN_PRICE_ID_MAP).find(
    ([, configuredPriceId]) => configuredPriceId === priceId
  );

  return entry ? entry[0] : null;
}

async function getOrCreateStripeCustomer(tenant, db = { query }) {
  if (tenant.stripe_customer_id) {
    return tenant.stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    email: tenant.email,
    name: tenant.business_name,
    metadata: {
      tenant_id: tenant.id,
    },
  });

  await db.query(
    `UPDATE tenants
     SET stripe_customer_id = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [customer.id, tenant.id]
  );

  return customer.id;
}

async function createCheckoutSession({
  customerId,
  tenantId,
  plan,
  priceId,
  successUrl,
  cancelUrl,
}) {
  return await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    allow_promotion_codes: true,
    metadata: {
      tenant_id: tenantId,
      plan,
    },
    subscription_data: {
      metadata: {
        tenant_id: tenantId,
        plan,
      },
    },
  });
}

async function createBillingPortalSession({ customerId, returnUrl }) {
  return await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

async function cancelSubscriptionAtPeriodEnd(subscriptionId) {
  return await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
}

async function resumeSubscription(subscriptionId) {
  return await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
  });
}

async function retrieveSubscription(subscriptionId) {
  return await stripe.subscriptions.retrieve(subscriptionId);
}

function constructWebhookEvent(payload, signature) {
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );
}

module.exports = {
  stripe,
  CLIENT_URL,
  getPlanPriceId,
  getPlanFromPriceId,
  getOrCreateStripeCustomer,
  createCheckoutSession,
  createBillingPortalSession,
  cancelSubscriptionAtPeriodEnd,
  resumeSubscription,
  retrieveSubscription,
  constructWebhookEvent,
};
