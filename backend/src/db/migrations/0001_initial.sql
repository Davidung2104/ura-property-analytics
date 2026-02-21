-- Migration 0001: Initial schema
-- Creates all core tables, indexes, enums, and materialized views.
-- Run: psql $DATABASE_URL < 0001_initial.sql

-- ── Enums ──

DO $$ BEGIN
  CREATE TYPE market_segment AS ENUM ('CCR', 'RCR', 'OCR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sale_type AS ENUM ('New Sale', 'Sub Sale', 'Resale');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tenure_type AS ENUM ('Freehold', 'Leasehold');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE user_plan AS ENUM ('free', 'pro', 'enterprise');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ingestion_status AS ENUM ('running', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ══════════════════════════════════════════════════════
-- SALES TRANSACTIONS
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sales_transactions (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project         TEXT NOT NULL,
  street          TEXT NOT NULL,
  district        VARCHAR(5) NOT NULL,
  market_segment  market_segment NOT NULL,
  property_type   TEXT NOT NULL,
  tenure          tenure_type NOT NULL,
  area_sqft       NUMERIC(10,2) NOT NULL,
  price           BIGINT NOT NULL,
  psf             NUMERIC(10,2) NOT NULL,
  floor_range     VARCHAR(20),
  floor_mid       SMALLINT,
  sale_type       sale_type,
  contract_date   VARCHAR(7) NOT NULL,
  year            SMALLINT NOT NULL,
  quarter         VARCHAR(7) NOT NULL,
  bedrooms        VARCHAR(5),
  batch_num       SMALLINT,
  batch_id        UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_project ON sales_transactions(project);
CREATE INDEX IF NOT EXISTS idx_sales_district ON sales_transactions(district);
CREATE INDEX IF NOT EXISTS idx_sales_segment ON sales_transactions(market_segment);
CREATE INDEX IF NOT EXISTS idx_sales_year ON sales_transactions(year);
CREATE INDEX IF NOT EXISTS idx_sales_quarter ON sales_transactions(quarter);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales_transactions(contract_date);
CREATE INDEX IF NOT EXISTS idx_sales_project_year ON sales_transactions(project, year);
CREATE INDEX IF NOT EXISTS idx_sales_district_year ON sales_transactions(district, year);
CREATE INDEX IF NOT EXISTS idx_sales_filters ON sales_transactions(district, market_segment, year, property_type, tenure);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_dedup ON sales_transactions(project, contract_date, price, area_sqft, floor_range);

-- ══════════════════════════════════════════════════════
-- RENTAL TRANSACTIONS
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rental_transactions (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project         TEXT NOT NULL,
  street          TEXT NOT NULL,
  district        VARCHAR(5) NOT NULL,
  market_segment  market_segment,
  area_sqft       NUMERIC(10,2) NOT NULL,
  rent            NUMERIC(10,2) NOT NULL,
  rent_psf        NUMERIC(10,4) NOT NULL,
  bedrooms        VARCHAR(5),
  lease_date      VARCHAR(7) NOT NULL,
  quarter         VARCHAR(7) NOT NULL,
  no_of_contracts SMALLINT DEFAULT 1,
  batch_id        UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rental_project ON rental_transactions(project);
CREATE INDEX IF NOT EXISTS idx_rental_district ON rental_transactions(district);
CREATE INDEX IF NOT EXISTS idx_rental_quarter ON rental_transactions(quarter);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_dedup ON rental_transactions(project, lease_date, area_sqft, rent, bedrooms);

-- ══════════════════════════════════════════════════════
-- USERS
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  display_name    TEXT,
  plan            user_plan DEFAULT 'free',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  last_login_at   TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ══════════════════════════════════════════════════════
-- REFRESH TOKENS
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  revoked_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_token ON refresh_tokens(token_hash);

-- ══════════════════════════════════════════════════════
-- PORTFOLIO HOLDINGS
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS portfolio_holdings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project         TEXT NOT NULL,
  unit_size       NUMERIC(10,2) NOT NULL,
  floor           VARCHAR(20),
  purchase_psf    NUMERIC(10,2) NOT NULL,
  purchase_date   VARCHAR(10),
  label           TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holdings_user ON portfolio_holdings(user_id);

-- ══════════════════════════════════════════════════════
-- SAVED SEARCHES
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS saved_searches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  filters         JSONB NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_user ON saved_searches(user_id);

-- ══════════════════════════════════════════════════════
-- CLIENT REPORTS
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS client_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_name     TEXT NOT NULL,
  project         TEXT NOT NULL,
  unit_config     JSONB,
  sections        JSONB,
  notes           TEXT,
  report_data     JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_user ON client_reports(user_id);

-- ══════════════════════════════════════════════════════
-- INGESTION BATCHES
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ingestion_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at      TIMESTAMPTZ NOT NULL,
  completed_at    TIMESTAMPTZ,
  status          ingestion_status DEFAULT 'running',
  sales_count     INT DEFAULT 0,
  rental_count    INT DEFAULT 0,
  error           TEXT,
  duration_ms     INT
);

-- ══════════════════════════════════════════════════════
-- MATERIALIZED VIEWS (pre-computed dashboard data)
-- ══════════════════════════════════════════════════════

-- Yearly aggregates
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_dashboard_by_year AS
  SELECT year,
         ROUND(AVG(psf::numeric), 0) AS avg_psf,
         ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf::numeric), 0) AS med_psf,
         COUNT(*) AS tx_count,
         SUM(price) AS total_volume
  FROM sales_transactions
  GROUP BY year
  ORDER BY year;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_year ON mv_dashboard_by_year(year);

-- District × segment (recent 2 years)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_dashboard_by_district AS
  SELECT district, market_segment,
         ROUND(AVG(psf::numeric), 0) AS avg_psf,
         COUNT(*) AS tx_count,
         SUM(price) AS total_volume
  FROM sales_transactions
  WHERE year >= EXTRACT(YEAR FROM NOW()) - 1
  GROUP BY district, market_segment;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_district ON mv_dashboard_by_district(district, market_segment);

-- Project summary (projects with 3+ transactions)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_project_summary AS
  SELECT project, MAX(street) AS street, MAX(district) AS district,
         MAX(market_segment::text)::market_segment AS market_segment,
         ROUND(AVG(psf::numeric), 0) AS avg_psf,
         COUNT(*) AS tx_count,
         MIN(year) AS first_year,
         MAX(year) AS last_year
  FROM sales_transactions
  GROUP BY project
  HAVING COUNT(*) >= 3;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_project ON mv_project_summary(project);

-- ══════════════════════════════════════════════════════
-- CLEANUP: expired refresh tokens (run periodically)
-- ══════════════════════════════════════════════════════

-- CREATE OR REPLACE FUNCTION cleanup_expired_tokens() RETURNS void AS $$
-- BEGIN
--   DELETE FROM refresh_tokens WHERE expires_at < NOW() OR revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '7 days';
-- END;
-- $$ LANGUAGE plpgsql;
