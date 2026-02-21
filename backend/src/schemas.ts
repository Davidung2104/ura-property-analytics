// ═══════════════════════════════════════════════════════
// Zod Schemas — Input validation for every API endpoint
// ═══════════════════════════════════════════════════════
import { z } from 'zod';

// ── Shared enums ──

export const MarketSegmentEnum = z.enum(['CCR', 'RCR', 'OCR']);
export const SortOrderEnum = z.enum([
  'date_desc', 'date_asc', 'psf_desc', 'psf_asc',
  'price_desc', 'price_asc', 'area_desc', 'area_asc',
  'rent_desc', 'rent_asc',
]);

// ── GET /api/dashboard/filtered ──

export const FilteredDashboardSchema = z.object({
  district: z.string().regex(/^(all|D\d{1,2})$/).optional(),
  year: z.string().regex(/^(all|\d{4})$/).optional(),
  segment: z.string().regex(/^(all|CCR|RCR|OCR)$/).optional(),
  propertyType: z.string().max(50).optional(),
  tenure: z.string().regex(/^(all|Freehold|Leasehold)$/).optional(),
});

export type FilteredDashboardInput = z.infer<typeof FilteredDashboardSchema>;

// ── GET /api/sales/search ──

export const SalesSearchSchema = z.object({
  q: z.string().max(200).optional(),
  district: z.string().regex(/^D\d{1,2}$/).optional(),
  segment: MarketSegmentEnum.optional(),
  type: z.string().max(20).optional(),
  tenure: z.string().max(20).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  sort: SortOrderEnum.default('date_desc'),
});

export type SalesSearchInput = z.infer<typeof SalesSearchSchema>;

// ── GET /api/rental/search ──

export const RentalSearchSchema = z.object({
  q: z.string().max(200).optional(),
  district: z.string().regex(/^D\d{1,2}$/).optional(),
  segment: MarketSegmentEnum.optional(),
  bedrooms: z.string().regex(/^[1-6]$/).optional(),
  areaSqft: z.string().max(20).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  sort: SortOrderEnum.default('date_desc'),
});

export type RentalSearchInput = z.infer<typeof RentalSearchSchema>;

// ── GET /api/project/:name ──

export const ProjectParamSchema = z.object({
  name: z.string().min(1).max(200),
});

// ── PUT /api/user/:id ──

export const UserIdSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9-]{1,64}$/, 'Invalid user ID'),
});

const PortfolioItemSchema = z.object({
  projectName: z.string().max(200),
  purchaseDate: z.string().max(20),
  purchasePsf: z.number().positive().max(100000),
  area: z.number().positive().max(50000),
  floorRange: z.string().max(20).optional(),
  notes: z.string().max(500).optional(),
}).passthrough();

const SavedSearchSchema = z.object({
  id: z.string().max(50),
  name: z.string().max(100),
  filters: z.record(z.string()).optional(),
  createdAt: z.string().optional(),
}).passthrough();

const ClientReportSchema = z.object({
  id: z.string().max(50),
  clientName: z.string().max(200),
  projectName: z.string().max(200),
}).passthrough();

export const UserBodySchema = z.object({
  portfolio: z.array(PortfolioItemSchema).max(50).default([]),
  savedSearches: z.array(SavedSearchSchema).max(20).default([]),
  clientReports: z.array(ClientReportSchema).max(100).default([]),
}).passthrough();

export type UserBodyInput = z.infer<typeof UserBodySchema>;

// ── POST /api/refresh ──

export const AdminAuthSchema = z.object({
  key: z.string().min(1).optional(),
});
