require('dotenv').config();

const db = require('../config/db');

const requiredTables = [
  'tenants',
  'users',
  'invitations',
  'subscriptions',
  'plan_limits',
  'halls',
  'clients',
  'bookings',
  'events',
  'attendees',
  'audit_log',
];

const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'EMAIL_HOST',
  'EMAIL_USER',
  'STRIPE_SECRET_KEY',
  'CLOUDINARY_CLOUD_NAME',
];

function pass(message) {
  console.log(`✅ ${message}`);
}

function fail(message) {
  console.log(`❌ ${message}`);
}

async function checkSetup() {
  let ok = true;

  console.log('EventsHub Setup Check');
  console.log('====================');

  try {
    await db.query('SELECT 1');
    pass('Database connection');
  } catch (error) {
    fail(`Database connection (${error.message})`);
    ok = false;
  }

  for (const table of requiredTables) {
    try {
      const result = await db.query(
        `SELECT EXISTS (
           SELECT 1
           FROM information_schema.tables
           WHERE table_schema = 'public'
             AND table_name = $1
         ) AS exists`,
        [table]
      );

      if (result.rows[0].exists) {
        pass(`Table exists: ${table}`);
      } else {
        fail(`Table missing: ${table}`);
        ok = false;
      }
    } catch (error) {
      fail(`Table check failed: ${table} (${error.message})`);
      ok = false;
    }
  }

  try {
    const result = await db.query('SELECT COUNT(*)::int AS count FROM plan_limits');
    if (result.rows[0].count === 3) {
      pass('plan_limits has 3 rows');
    } else {
      fail(`plan_limits has ${result.rows[0].count} rows`);
      ok = false;
    }
  } catch (error) {
    fail(`plan_limits check failed (${error.message})`);
    ok = false;
  }

  try {
    const result = await db.query(
      "SELECT id FROM users WHERE role = 'super_admin' LIMIT 1"
    );
    if (result.rows.length > 0) {
      pass('Super admin user exists');
    } else {
      fail('Super admin user missing');
      ok = false;
    }
  } catch (error) {
    fail(`Super admin check failed (${error.message})`);
    ok = false;
  }

  for (const envVar of requiredEnvVars) {
    if (process.env[envVar]) {
      pass(`Env var set: ${envVar}`);
    } else {
      fail(`Env var missing: ${envVar}`);
      ok = false;
    }
  }

  if (ok) {
    console.log('🚀 Everything looks good! Run npm run dev');
  } else {
    console.log('⚠ Setup incomplete. Fix errors above.');
  }

  await db.end();
  process.exit(ok ? 0 : 1);
}

checkSetup().catch(async (error) => {
  console.error('Setup check failed:', error);
  await db.end();
  process.exit(1);
});
