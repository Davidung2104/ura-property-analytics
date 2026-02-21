/**
 * db/schema.ts — Drizzle ORM schema definitions
 *
 * Maps the entire URA data model to PostgreSQL.
 * Uses Drizzle's type-safe builder — zero runtime overhead.
 *
 * Tables:
 *   sales_transactions   — URA private residential sales
 *   rental_transactions  — URA rental contracts
 *   users                — Authentication accounts
 *   portfolio_holdings   — User property holdings
 *   saved_searches       — User saved filter sets
 *   client_reports       — Generated client reports
 *   ingestion_batches    — URA data refresh tracking
 *   refresh_tokens       — JWT refresh token storage
 */
import {
  pgTable, uuid, text, varchar, numeric, integer, smallint, bigint,
  timestamp, boolean, jsonb, index, uniqueIndex, check,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ── Enums ──

export const marketSegmentEnum = pgEnum('market_segment', ['CCR', 'RCR', 'OCR']);
export const saleTypeEnum = pgEnum('sale_type', ['New Sale', 'Sub Sale', 'Resale']);
export const tenureTypeEnum = pgEnum('tenure_type', ['Freehold', 'Leasehold']);
export const planEnum = pgEnum('user_plan', ['free', 'pro', 'enterprise']);
export const ingestionStatusEnum = pgEnum('ingestion_status', ['running', 'completed', 'failed']);

// ══════════════════════════════════════════════════════
// TRANSACTION TABLES
// ══════════════════════════════════════════════════════

export const salesTransactions = pgTable('sales_transactions', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  project: text('project').notNull(),
  street: text('street').notNull(),
  district: varchar('district', { length: 5 }).notNull(),         // "D10"
  marketSegment: marketSegmentEnum('market_segment').notNull(),
  propertyType: text('property_type').notNull(),                   // "Condominium", "Apartment", etc
  tenure: tenureTypeEnum('tenure').notNull(),
  areaSqft: numeric('area_sqft', { precision: 10, scale: 2 }).notNull(),
  price: bigint('price', { mode: 'number' }).notNull(),
  psf: numeric('psf', { precision: 10, scale: 2 }).notNull(),
  floorRange: varchar('floor_range', { length: 20 }),              // "06-10"
  floorMid: smallint('floor_mid'),
  saleType: saleTypeEnum('sale_type'),
  contractDate: varchar('contract_date', { length: 7 }).notNull(), // "2024-01"
  year: smallint('year').notNull(),
  quarter: varchar('quarter', { length: 7 }).notNull(),            // "24Q1"
  bedrooms: varchar('bedrooms', { length: 5 }),                    // "3" or "3/4"
  batchNum: smallint('batch_num'),                                 // URA batch 1-4
  batchId: uuid('batch_id'),                                       // Links to ingestion_batches
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  projectIdx: index('idx_sales_project').on(table.project),
  districtIdx: index('idx_sales_district').on(table.district),
  segmentIdx: index('idx_sales_segment').on(table.marketSegment),
  yearIdx: index('idx_sales_year').on(table.year),
  quarterIdx: index('idx_sales_quarter').on(table.quarter),
  dateIdx: index('idx_sales_date').on(table.contractDate),
  projectYearIdx: index('idx_sales_project_year').on(table.project, table.year),
  distYearIdx: index('idx_sales_district_year').on(table.district, table.year),
  // Composite for filtered dashboard queries
  filtersIdx: index('idx_sales_filters').on(
    table.district, table.marketSegment, table.year, table.propertyType, table.tenure
  ),
  // Dedup constraint: same project+date+price+area+floor = same transaction
  dedupIdx: uniqueIndex('idx_sales_dedup').on(
    table.project, table.contractDate, table.price, table.areaSqft, table.floorRange
  ),
}));

export const rentalTransactions = pgTable('rental_transactions', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  project: text('project').notNull(),
  street: text('street').notNull(),
  district: varchar('district', { length: 5 }).notNull(),
  marketSegment: marketSegmentEnum('market_segment'),
  areaSqft: numeric('area_sqft', { precision: 10, scale: 2 }).notNull(),
  rent: numeric('rent', { precision: 10, scale: 2 }).notNull(),
  rentPsf: numeric('rent_psf', { precision: 10, scale: 4 }).notNull(),
  bedrooms: varchar('bedrooms', { length: 5 }),
  leaseDate: varchar('lease_date', { length: 7 }).notNull(),       // "2024-01"
  quarter: varchar('quarter', { length: 7 }).notNull(),
  noOfContracts: smallint('no_of_contracts').default(1),
  batchId: uuid('batch_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  projectIdx: index('idx_rental_project').on(table.project),
  districtIdx: index('idx_rental_district').on(table.district),
  quarterIdx: index('idx_rental_quarter').on(table.quarter),
  dedupIdx: uniqueIndex('idx_rental_dedup').on(
    table.project, table.leaseDate, table.areaSqft, table.rent, table.bedrooms
  ),
}));

// ══════════════════════════════════════════════════════
// USER TABLES
// ══════════════════════════════════════════════════════

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name'),
  plan: planEnum('plan').default('free'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
}, (table) => ({
  emailIdx: uniqueIndex('idx_users_email').on(table.email),
}));

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (table) => ({
  userIdx: index('idx_refresh_user').on(table.userId),
  tokenIdx: uniqueIndex('idx_refresh_token').on(table.tokenHash),
}));

export const portfolioHoldings = pgTable('portfolio_holdings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  project: text('project').notNull(),
  unitSize: numeric('unit_size', { precision: 10, scale: 2 }).notNull(),
  floor: varchar('floor', { length: 20 }),
  purchasePsf: numeric('purchase_psf', { precision: 10, scale: 2 }).notNull(),
  purchaseDate: varchar('purchase_date', { length: 10 }),  // "2024-01"
  label: text('label'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  userIdx: index('idx_holdings_user').on(table.userId),
}));

export const savedSearches = pgTable('saved_searches', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  filters: jsonb('filters').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  userIdx: index('idx_saved_user').on(table.userId),
}));

export const clientReports = pgTable('client_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  clientName: text('client_name').notNull(),
  project: text('project').notNull(),
  unitConfig: jsonb('unit_config'),           // { area, floor }
  sections: jsonb('sections'),                // { overview: true, valuation: true, ... }
  notes: text('notes'),
  reportData: jsonb('report_data'),           // Snapshot at time of report
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  userIdx: index('idx_reports_user').on(table.userId),
}));

// ══════════════════════════════════════════════════════
// INGESTION TRACKING
// ══════════════════════════════════════════════════════

export const ingestionBatches = pgTable('ingestion_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  status: ingestionStatusEnum('status').default('running'),
  salesCount: integer('sales_count').default(0),
  rentalCount: integer('rental_count').default(0),
  error: text('error'),
  durationMs: integer('duration_ms'),
});

// ══════════════════════════════════════════════════════
// MATERIALIZED VIEWS (created via raw SQL in migrations)
// ══════════════════════════════════════════════════════

/**
 * These are defined in migration SQL, not in Drizzle schema.
 * Drizzle doesn't natively support materialized views.
 *
 * mv_dashboard_by_year    — yearly PSF aggregates
 * mv_dashboard_by_district — district × segment aggregates (last 2 years)
 * mv_project_summary      — project-level stats (projects with 3+ txns)
 *
 * Refresh after each ingestion:
 *   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_by_year;
 *   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_by_district;
 *   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_project_summary;
 */

// ── Type exports for use in services ──

export type SalesTransaction = typeof salesTransactions.$inferSelect;
export type NewSalesTransaction = typeof salesTransactions.$inferInsert;
export type RentalTransaction = typeof rentalTransactions.$inferSelect;
export type NewRentalTransaction = typeof rentalTransactions.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type PortfolioHolding = typeof portfolioHoldings.$inferSelect;
export type NewPortfolioHolding = typeof portfolioHoldings.$inferInsert;
export type IngestionBatch = typeof ingestionBatches.$inferSelect;
