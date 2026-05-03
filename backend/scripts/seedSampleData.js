require('dotenv').config();

const bcrypt = require('bcryptjs');
const db = require('../config/db');

const tenantSlug = 'lagos-grand-events';

function dateFromNow(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function seedSampleData() {
  try {
    await db.withTransaction(async (client) => {
      const existingTenant = await client.query(
        'SELECT id FROM tenants WHERE slug = $1 OR business_name = $2 LIMIT 1',
        [tenantSlug, 'Lagos Grand Events']
      );

      if (existingTenant.rows.length > 0) {
        console.log('Sample tenant already exists');
        return;
      }

      const tenantResult = await client.query(
        `INSERT INTO tenants (
           business_name, slug, email, phone, address, city, state, website,
           plan, plan_status, trial_ends_at, is_active
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW() + INTERVAL '14 days', $11)
         RETURNING id, business_name`,
        [
          'Lagos Grand Events',
          tenantSlug,
          'info@lagosgrandevents.com',
          '+234 801 234 5678',
          '14 Admiralty Way, Lekki Phase 1',
          'Lagos',
          'Lagos',
          'https://lagosgrandevents.test',
          'pro',
          'trialing',
          true,
        ]
      );
      const tenant = tenantResult.rows[0];

      const passwordHash = await bcrypt.hash('Demo@123', 12);
      const ownerResult = await client.query(
        `INSERT INTO users (
           tenant_id, full_name, email, password_hash, role,
           is_verified, onboarding_complete, is_active
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          tenant.id,
          'Demo Owner',
          'demo@test.com',
          passwordHash,
          'owner',
          true,
          true,
          true,
        ]
      );
      const ownerId = ownerResult.rows[0].id;

      const hallSeeds = [
        {
          name: 'Main Auditorium',
          capacity: 500,
          description: 'Large indoor hall for premium ceremonies and conferences.',
          amenities: ['AC', 'WiFi', 'Projector', 'Sound System', 'Stage', 'Parking'],
          price: 50000,
        },
        {
          name: 'Banquet Hall',
          capacity: 250,
          description: 'Elegant hall for receptions, dinners, and private events.',
          amenities: ['AC', 'WiFi', 'Catering', 'Parking'],
          price: 30000,
        },
        {
          name: 'Garden Pavilion',
          capacity: 150,
          description: 'Outdoor covered space for intimate celebrations.',
          amenities: ['Catering', 'Parking', 'Stage'],
          price: 20000,
        },
      ];

      const halls = [];
      for (const hall of hallSeeds) {
        const result = await client.query(
          `INSERT INTO halls (
             tenant_id, name, capacity, description, amenities,
             price_per_hour, is_available
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, name`,
          [
            tenant.id,
            hall.name,
            hall.capacity,
            hall.description,
            hall.amenities,
            hall.price,
            true,
          ]
        );
        halls.push(result.rows[0]);
      }

      const clientSeeds = [
        ['Aisha Bello', 'aisha@example.com', '+234 802 111 1111', 'Victoria Island, Lagos'],
        ['Chinedu Okafor', 'chinedu@example.com', '+234 803 222 2222', 'Ikeja, Lagos'],
        ['Fatima Musa', 'fatima@example.com', '+234 804 333 3333', 'Surulere, Lagos'],
        ['Tunde Adeyemi', 'tunde@example.com', '+234 805 444 4444', 'Yaba, Lagos'],
        ['Ngozi Eze', 'ngozi@example.com', '+234 806 555 5555', 'Lekki, Lagos'],
      ];

      const clients = [];
      for (const sampleClient of clientSeeds) {
        const result = await client.query(
          `INSERT INTO clients (tenant_id, full_name, email, phone, address, notes)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, full_name`,
          [tenant.id, ...sampleClient, 'Seeded demo client']
        );
        clients.push(result.rows[0]);
      }

      const bookingSeeds = [
        {
          client: 0,
          hall: 0,
          event_name: 'Aisha and Daniel Wedding',
          event_type: 'wedding',
          date: dateFromNow(12),
          time: '14:00',
          duration: 6,
          guests: 420,
          status: 'approved',
          payment_status: 'paid',
          amount_due: 300000,
          amount_paid: 300000,
        },
        {
          client: 1,
          hall: 1,
          event_name: 'Okafor Annual Strategy Conference',
          event_type: 'conference',
          date: dateFromNow(3),
          time: '09:00',
          duration: 8,
          guests: 180,
          status: 'approved',
          payment_status: 'partial',
          amount_due: 240000,
          amount_paid: 120000,
        },
        {
          client: 2,
          hall: 2,
          event_name: 'Fatima 40th Birthday',
          event_type: 'birthday',
          date: dateFromNow(21),
          time: '17:00',
          duration: 5,
          guests: 130,
          status: 'pending',
          payment_status: 'unpaid',
          amount_due: 100000,
          amount_paid: 0,
        },
        {
          client: 3,
          hall: 0,
          event_name: 'Lagos Gospel Concert',
          event_type: 'concert',
          date: dateFromNow(1),
          time: '18:00',
          duration: 4,
          guests: 500,
          status: 'approved',
          payment_status: 'paid',
          amount_due: 200000,
          amount_paid: 200000,
        },
        {
          client: 4,
          hall: 1,
          event_name: 'Product Launch Seminar',
          event_type: 'seminar',
          date: dateFromNow(18),
          time: '10:00',
          duration: 4,
          guests: 220,
          status: 'rejected',
          payment_status: 'unpaid',
          amount_due: 120000,
          amount_paid: 0,
        },
        {
          client: 0,
          hall: 2,
          event_name: 'Family Thanksgiving',
          event_type: 'religious',
          date: dateFromNow(-5),
          time: '12:00',
          duration: 3,
          guests: 100,
          status: 'cancelled',
          payment_status: 'partial',
          amount_due: 60000,
          amount_paid: 20000,
        },
        {
          client: 2,
          hall: 1,
          event_name: 'Graduation Reception',
          event_type: 'graduation',
          date: dateFromNow(30),
          time: '13:00',
          duration: 5,
          guests: 200,
          status: 'pending',
          payment_status: 'unpaid',
          amount_due: 150000,
          amount_paid: 0,
        },
        {
          client: 4,
          hall: 0,
          event_name: 'Corporate Awards Night',
          event_type: 'other',
          date: dateFromNow(-2),
          time: '19:00',
          duration: 4,
          guests: 350,
          status: 'approved',
          payment_status: 'paid',
          amount_due: 200000,
          amount_paid: 200000,
        },
      ];

      const bookings = [];
      for (const booking of bookingSeeds) {
        const result = await client.query(
          `INSERT INTO bookings (
             tenant_id, client_id, hall_id, event_name, event_type,
             preferred_date, preferred_time, duration_hours, guest_count,
             notes, status, payment_status, amount_due, amount_paid, created_by
           )
           VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9,
             $10, $11, $12, $13, $14, $15
           )
           RETURNING id, preferred_date, preferred_time, duration_hours, guest_count, status`,
          [
            tenant.id,
            clients[booking.client].id,
            halls[booking.hall].id,
            booking.event_name,
            booking.event_type,
            booking.date,
            booking.time,
            booking.duration,
            booking.guests,
            'Seeded demo booking',
            booking.status,
            booking.payment_status,
            booking.amount_due,
            booking.amount_paid,
            ownerId,
          ]
        );
        bookings.push(result.rows[0]);

        await client.query(
          'UPDATE clients SET total_bookings = total_bookings + 1 WHERE id = $1',
          [clients[booking.client].id]
        );
      }

      const eventSeeds = [
        { bookingIndex: 0, status: 'upcoming', total_attendees: 0, check_in_count: 0 },
        { bookingIndex: 1, status: 'ongoing', total_attendees: 120, check_in_count: 30 },
        { bookingIndex: 7, status: 'completed', total_attendees: 80, check_in_count: 80 },
      ];

      for (const event of eventSeeds) {
        const booking = bookings[event.bookingIndex];
        await client.query(
          `INSERT INTO events (
             tenant_id, booking_id, event_date, start_time, end_time,
             total_attendees, check_in_count, status, approved_by, approved_at
           )
           VALUES (
             $1, $2, $3, $4,
             ($4::time + ($5::int || ' hours')::interval)::time,
             $6, $7, $8, $9, NOW()
           )`,
          [
            tenant.id,
            booking.id,
            booking.preferred_date,
            booking.preferred_time,
            booking.duration_hours,
            event.total_attendees,
            event.check_in_count,
            event.status,
            ownerId,
          ]
        );
      }

      console.log('✅ Sample data created!');
      console.log(`Tenant: ${tenant.business_name}`);
      console.log('Owner email: demo@test.com');
      console.log('Password: Demo@123');
    });
  } finally {
    await db.end();
  }
}

seedSampleData().catch(async (error) => {
  console.error('Failed to seed sample data:', error);
  await db.end();
  process.exit(1);
});
