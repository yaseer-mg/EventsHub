-- =============================================
-- ENABLE UUID extension
-- =============================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================
-- TABLE 1: TENANTS
-- Each row = one events center business account
-- =============================================
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name       VARCHAR(255) NOT NULL,
  slug                VARCHAR(100) UNIQUE NOT NULL,
  logo_url            TEXT,
  primary_color       VARCHAR(7) DEFAULT '#6366f1',
  notification_prefs  JSONB DEFAULT '{
    "email_new_booking": true,
    "email_payment_received": true,
    "email_event_reminder": true,
    "email_low_usage_alert": false
  }',
  email               VARCHAR(255) NOT NULL,
  phone               VARCHAR(50),
  address             TEXT,
  city                VARCHAR(100),
  state               VARCHAR(100),
  website             VARCHAR(255),
  currency            VARCHAR(10) DEFAULT '₦',
  timezone            VARCHAR(50) DEFAULT 'Africa/Lagos',
  plan                VARCHAR(50) DEFAULT 'free'
    CHECK (plan IN ('free','pro','enterprise')),
  plan_status         VARCHAR(50) DEFAULT 'trialing'
    CHECK (plan_status IN
      ('active','trialing','past_due','cancelled','suspended')),
  trial_ends_at       TIMESTAMP,
  stripe_customer_id  VARCHAR(255),
  is_active           BOOLEAN DEFAULT true,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- TABLE 2: USERS
-- Staff accounts. tenant_id NULL = super admin
-- =============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID REFERENCES tenants(id) ON DELETE CASCADE,
  full_name           VARCHAR(255) NOT NULL,
  email               VARCHAR(255) UNIQUE NOT NULL,
  password_hash       VARCHAR(255) NOT NULL,
  avatar_url          TEXT,
  role                VARCHAR(50) DEFAULT 'staff'
    CHECK (role IN ('super_admin','owner','manager','staff')),
  is_verified         BOOLEAN DEFAULT false,
  verify_token        VARCHAR(255),
  verify_token_expires TIMESTAMP,
  reset_token         VARCHAR(255),
  reset_token_expires TIMESTAMP,
  onboarding_complete BOOLEAN DEFAULT false,
  is_active           BOOLEAN DEFAULT true,
  last_login_at       TIMESTAMP,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- TABLE 3: INVITATIONS
-- =============================================
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
  invited_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  email       VARCHAR(255) NOT NULL,
  role        VARCHAR(50) DEFAULT 'staff'
    CHECK (role IN ('manager','staff')),
  token       VARCHAR(255) UNIQUE NOT NULL,
  accepted    BOOLEAN DEFAULT false,
  expires_at  TIMESTAMP NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- TABLE 4: SUBSCRIPTIONS
-- =============================================
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID UNIQUE REFERENCES tenants(id)
                            ON DELETE CASCADE,
  stripe_subscription_id  VARCHAR(255) UNIQUE,
  stripe_price_id         VARCHAR(255),
  plan                    VARCHAR(50) NOT NULL,
  status                  VARCHAR(50) NOT NULL,
  current_period_start    TIMESTAMP,
  current_period_end      TIMESTAMP,
  cancel_at_period_end    BOOLEAN DEFAULT false,
  cancelled_at            TIMESTAMP,
  created_at              TIMESTAMP DEFAULT NOW(),
  updated_at              TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- TABLE 5: PLAN LIMITS
-- =============================================
CREATE TABLE plan_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan                        VARCHAR(50) UNIQUE NOT NULL,
  max_bookings_per_month      INTEGER DEFAULT 10,
  max_events_per_month        INTEGER DEFAULT 5,
  max_attendees_per_event     INTEGER DEFAULT 50,
  max_team_members            INTEGER DEFAULT 1,
  max_halls                   INTEGER DEFAULT 1,
  can_export_reports          BOOLEAN DEFAULT false,
  can_custom_branding         BOOLEAN DEFAULT false,
  can_api_access              BOOLEAN DEFAULT false,
  price_monthly_ngn           DECIMAL(12,2) DEFAULT 0,
  stripe_price_id             VARCHAR(255)
);

-- =============================================
-- TABLE 6: HALLS (tenant-scoped)
-- =============================================
CREATE TABLE halls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  capacity        INTEGER NOT NULL,
  description     TEXT,
  amenities       TEXT[] DEFAULT '{}',
  price_per_hour  DECIMAL(12,2) DEFAULT 0,
  is_available    BOOLEAN DEFAULT true,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- TABLE 7: CLIENTS (tenant-scoped)
-- =============================================
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
  full_name       VARCHAR(255) NOT NULL,
  email           VARCHAR(255),
  phone           VARCHAR(50),
  address         TEXT,
  notes           TEXT,
  total_bookings  INTEGER DEFAULT 0,
  created_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);

-- =============================================
-- TABLE 8: BOOKINGS (tenant-scoped)
-- =============================================
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
  client_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
  hall_id         UUID REFERENCES halls(id) ON DELETE SET NULL,
  event_name      VARCHAR(255) NOT NULL,
  event_type      VARCHAR(100) CHECK (event_type IN (
    'wedding','conference','birthday','concert',
    'seminar','graduation','religious','other')),
  preferred_date  DATE NOT NULL,
  preferred_time  TIME NOT NULL,
  duration_hours  INTEGER DEFAULT 2,
  guest_count     INTEGER DEFAULT 1,
  notes           TEXT,
  status          VARCHAR(50) DEFAULT 'pending'
    CHECK (status IN
      ('pending','approved','rejected','cancelled')),
  is_active       BOOLEAN DEFAULT true,
  payment_status  VARCHAR(50) DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','partial','paid')),
  amount_due      DECIMAL(12,2) DEFAULT 0,
  amount_paid     DECIMAL(12,2) DEFAULT 0,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- TABLE 9: EVENTS (tenant-scoped)
-- =============================================
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id        UUID UNIQUE REFERENCES bookings(id)
                      ON DELETE CASCADE,
  event_date        DATE NOT NULL,
  start_time        TIME NOT NULL,
  end_time          TIME NOT NULL,
  total_attendees   INTEGER DEFAULT 0,
  check_in_count    INTEGER DEFAULT 0,
  status            VARCHAR(50) DEFAULT 'upcoming'
    CHECK (status IN
      ('upcoming','ongoing','completed','cancelled')),
  approved_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at       TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- TABLE 10: ATTENDEES (tenant-scoped)
-- =============================================
CREATE TABLE attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  event_id      UUID REFERENCES events(id) ON DELETE CASCADE,
  full_name     VARCHAR(255) NOT NULL,
  seat_number   VARCHAR(50) NOT NULL,
  tag           VARCHAR(100),
  pass_template VARCHAR(80),
  pass_details  JSONB DEFAULT '{}'::jsonb,
  qr_token      VARCHAR(255) UNIQUE NOT NULL,
  checked_in    BOOLEAN DEFAULT false,
  checked_in_at TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- TABLE 11: AUDIT LOG
-- =============================================
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      UUID,
  actor_email   VARCHAR(255),
  tenant_id     UUID,
  action        VARCHAR(255) NOT NULL,
  resource      VARCHAR(100),
  resource_id   UUID,
  metadata      JSONB,
  ip_address    VARCHAR(50),
  created_at    TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- PERFORMANCE INDEXES
-- =============================================
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_bookings_tenant_id ON bookings(tenant_id);
CREATE INDEX idx_bookings_tenant_status ON bookings(tenant_id, status);
CREATE INDEX idx_bookings_tenant_date ON bookings(tenant_id, preferred_date);
CREATE INDEX idx_events_tenant_id ON events(tenant_id);
CREATE INDEX idx_events_tenant_date ON events(tenant_id, event_date);
CREATE INDEX idx_attendees_event_id ON attendees(event_id);
CREATE INDEX idx_attendees_qr_token ON attendees(qr_token);
CREATE UNIQUE INDEX idx_attendees_event_seat ON attendees(event_id, LOWER(seat_number));
CREATE INDEX idx_clients_tenant_id ON clients(tenant_id);
CREATE INDEX idx_halls_tenant_id ON halls(tenant_id);
CREATE INDEX idx_audit_tenant_id ON audit_log(tenant_id);
CREATE INDEX idx_audit_created_at ON audit_log(created_at);

-- =============================================
-- SEED: PLAN LIMITS
-- =============================================
INSERT INTO plan_limits (
  plan, max_bookings_per_month, max_events_per_month,
  max_attendees_per_event, max_team_members, max_halls,
  can_export_reports, can_custom_branding, can_api_access,
  price_monthly_ngn
) VALUES
  ('free',       10,   5,   50,  1,  1, false, false, false, 0),
  ('pro',       100,  50,  500,  5,  5, true,  true,  false, 15000),
  ('enterprise', -1,  -1,   -1, -1, -1, true,  true,  true,  45000);
