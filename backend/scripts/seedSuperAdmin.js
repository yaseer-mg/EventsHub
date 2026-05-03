require('dotenv').config();

const bcrypt = require('bcryptjs');
const db = require('../config/db');

async function seedSuperAdmin() {
  try {
    const existing = await db.query(
      "SELECT id FROM users WHERE role = 'super_admin' LIMIT 1"
    );

    if (existing.rows.length > 0) {
      console.log('Super admin already exists');
      return;
    }

    const passwordHash = await bcrypt.hash('SuperAdmin@123', 12);

    await db.query(
      `INSERT INTO users (
         tenant_id, full_name, email, password_hash, role,
         is_verified, onboarding_complete
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        null,
        'Platform Admin',
        'admin@eventshub.com',
        passwordHash,
        'super_admin',
        true,
        true,
      ]
    );

    console.log('✅ Super admin created!');
    console.log('Email: admin@eventshub.com');
    console.log('Password: SuperAdmin@123');
    console.log('IMPORTANT: Change this password after first login!');
  } finally {
    await db.end();
  }
}

seedSuperAdmin().catch(async (error) => {
  console.error('Failed to seed super admin:', error);
  await db.end();
  process.exit(1);
});
