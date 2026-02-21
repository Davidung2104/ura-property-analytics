// ═══════════════════════════════════════════════════════
// URA Platform — Core Type Definitions
// Every data shape used across the platform.
// ═══════════════════════════════════════════════════════

// ── URA API raw shapes ──

export interface UraTransaction {
  contractDate: string;   // MMYY format e.g. "0124"
  area: string;           // sqm as string
  price: string;          // total price as string
  floorRange: string;     // "06 to 10"
  district: string;       // "10"
  typeOfSale: string;     // "1"=new, "2"=sub, "3"=resale
  tenure: string;         // "Leasehold 99 yr" | "Freehold"
  propertyType: string;   // "Condominium" | "Apartment" | "EC"
}

export interface UraProject {
  project: string;
  street: string;
  marketSegment: string;  // "CCR" | "RCR" | "OCR"
  transaction: UraTransaction[];
}

export interface UraRentalRecord {
  project: string;
  street: string;
  district: string;
  leaseDate: string;      // "24q1" format
  areaSqm: string;
  noOfBedRoom: string;
  monthlyRent: string;
  propertyType?: string;
  areaSqft?: string;
}

// ── Parsed / stored records ──

export type MarketSegment = 'CCR' | 'RCR' | 'OCR';
export type SaleType = 'New Sale' | 'Sub Sale' | 'Resale';
export type TenureType = 'Freehold' | 'Leasehold';

export interface SalesRecord {
  d: string;      // YYYY-MM date
  p: string;      // project name
  st: string;     // street
  di: string;     // district "D10"
  sg: MarketSegment;
  a: number;      // area sqft
  pr: number;     // total price
  ps: number;     // PSF
  fl: string;     // floor band "06-10"
  fm: number;     // floor midpoint
  tp: SaleType;
  pt: string;     // property type
  tn: TenureType;
  bn: number;     // batch number
  q: string;      // quarter "24Q1"
  yr: string;     // year "2024"
}

export interface RentalRecord {
  d: string;      // YYYY-MM date
  p: string;      // project name
  st: string;     // street
  di: string;     // district "D10"
  sg: MarketSegment;
  a: number;      // area sqft
  af: string;     // area filter band "800 - 900"
  br: string;     // bedrooms
  rn: number;     // monthly rent
  rp: number;     // rent PSF
  nc: number;     // number of contracts
  lc: string;     // lease commencement
}

// ── Helpers ──

export interface ParsedDate {
  year: number;
  quarter: string;  // "24Q1"
  month: number;
}

export interface ParsedFloor {
  band: string | null;
  mid: number;
}

export type YieldMap = Record<string, number>;

// ── Aggregator buckets ──

export interface AggBucket {
  s: number;      // PSF sum
  n: number;      // count
  pr: number;     // price sum
  byY: Record<string, { s: number; n: number }>;
}

export interface ProjBucket extends AggBucket {
  street: string;
  seg: MarketSegment;
  dist: string;
  tenure: string;
  type: string;
  sizes: number[];
  latestDate: string;
}

// ── Dashboard output ──

export interface YoyEntry {
  year: string;
  avg: number;
  n: number;
  rentAvg?: number;
  rentN?: number;
}

export interface SegEntry {
  seg: MarketSegment;
  avg: number;
  n: number;
  vol: number;
}

export interface RentalSegEntry {
  seg: MarketSegment;
  avgRent: number;
  avgRentPsf: number;
  count: number;
}

export interface DistBarEntry {
  d: string;
  v: number;
  n: number;
  vol: number;
  rentAvg?: number;
  rentPsf?: number;
  rentN?: number;
}

export interface TenureEntry {
  t: TenureType;
  avg: number;
  n: number;
}

export interface TypeEntry {
  t: string;
  avg: number;
  n: number;
}

export interface HistEntry {
  r: string;      // range label "$1200"
  c: number;      // count
}

export interface ScatterPoint {
  a: number;      // area
  p: number;      // PSF
  d: string;      // date
  n: string;      // project name
}

export interface CagrEntry {
  name: string;
  startAvg: number;
  endAvg: number;
  cagr: number;
  startN: number;
  endN: number;
  lowConf: boolean;
  cagrYears: number;
}

export interface DistTopPsfEntry {
  dist: string;
  projects: Array<{ name: string; psf: number; n: number }>;
}

export interface ProjIndexEntry {
  dist: string;
  seg: MarketSegment;
  street: string;
  tenure: string;
  type: string;
  psf: number;
  n: number;
  latestDate: string;
  sizes: number[];
  yearPsf: Record<string, number>;
  rentPsf?: number;
  rentAvg?: number;
}

export interface DashboardData {
  totalTx: number;
  totalVolume: number;
  avgPsf: number;
  medPsf: number;
  psfP5: number;
  psfP25: number;
  psfP75: number;
  psfP95: number;
  years: string[];
  latestYear: string;
  yoyPct: number | null;
  qoqPct: number | null;
  avgPrice: number;
  hasRealRental: boolean;
  avgRentPsf: number | null;
  avgRent: number | null;
  avgGrossYield: number | null;
  rentalTxCount: number;
  salesPeriod: string;
  rentalPeriod: string;
  segCounts: Record<string, number>;
  dominantSeg: MarketSegment;
  districtNames: string[];
  topDistricts: DistBarEntry[];
  yoy: YoyEntry[];
  sSeg: SegEntry[];
  rSeg: RentalSegEntry[];
  sDistBar: DistBarEntry[];
  sTenure: TenureEntry[];
  sType: TypeEntry[];
  sHist: HistEntry[];
  rHist: HistEntry[];
  sScat: ScatterPoint[];
  cagrData: CagrEntry[];
  distTopPsf: DistTopPsfEntry[];
  projList: string[];
  projIndex: Record<string, ProjIndexEntry>;
  cmpPool: string[];
  mktSaleTx: SalesRecord[];
  _projYearData: Record<string, Record<string, { s: number; n: number }>>;
}

// ── Project detail ──

export interface ProjectTransaction {
  date: string;
  price: number;
  psf: number;
  area: number;
  floorRange: string | null;
  floorMid: number;
  saleType: SaleType;
  tenure: string;
  type: string;
}

export interface FloorPremiumEntry {
  range: string;
  avg: number;
  n: number;
  premium: number;
}

export interface ProjectDetail {
  name: string;
  district: string;
  segment: MarketSegment;
  street: string;
  tenure: string;
  type: string;
  txCount: number;
  avgPsf: number;
  medPsf: number;
  minPsf: number;
  maxPsf: number;
  avgPrice: number;
  sizes: number[];
  avgArea: number;
  transactions: ProjectTransaction[];
  psfTrend: Array<{ year: string; avg: number; n: number }>;
  rentalTrend: Array<{ quarter: string; avgRent: number; avgRentPsf: number; n: number }>;
  floorPremium: FloorPremiumEntry[];
  heatmap: Array<{ year: string; quarter: string; avg: number; n: number }>;
  scatter: ScatterPoint[];
  nearby: Array<{ name: string; psf: number; n: number; dist: string }>;
  cagr: number | null;
  cagrYears: number;
  cagrStartAvg: number | null;
  cagrEndAvg: number | null;
  realRentalPsf: number | null;
  realRent: number | null;
  estimatedRentPsf: number | null;
  grossYield: number | null;
}

// ── Search results ──

export interface SearchResult<T> {
  results: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SalesSearchOpts {
  q?: string;
  district?: string;
  segment?: string;
  type?: string;
  tenure?: string;
  page: number;
  limit: number;
  sort: string;
}

export interface RentalSearchOpts {
  q?: string;
  district?: string;
  segment?: string;
  bedrooms?: string;
  areaSqft?: string;
  page: number;
  limit: number;
  sort: string;
}

// ── Filters ──

export interface DashboardFilters {
  district?: string;
  year?: string;
  segment?: string;
  propertyType?: string;
  tenure?: string;
}

export interface FilterOptions {
  districts: string[];
  years: string[];
  segments: string[];
  propertyTypes: string[];
  tenures: string[];
}

// ── User data ──

export interface PortfolioItem {
  projectName: string;
  purchaseDate: string;
  purchasePsf: number;
  area: number;
  floorRange?: string;
  notes?: string;
}

export interface SavedSearch {
  id: string;
  name: string;
  filters: DashboardFilters;
  createdAt: string;
}

export interface ClientReport {
  id: string;
  clientName: string;
  projectName: string;
  createdAt: string;
  unitConfig: { area: number; floor?: string };
  sections: Record<string, boolean>;
  notes?: string;
  snapshot: Record<string, unknown>;
}

export interface UserData {
  portfolio: PortfolioItem[];
  savedSearches: SavedSearch[];
  clientReports: ClientReport[];
  updatedAt?: string;
}

// ── Token ──

export interface TokenInfo {
  hasToken: boolean;
  expiresAt: string | null;
  ageMinutes: number | null;
}

// ── Cache status ──

export interface CacheInfo {
  memory: {
    hasDashboard: boolean;
    hasRealRental: boolean;
    salesCount: number;
    rentalCount: number;
    projectCount: number;
    cacheAgeMinutes: number | null;
  };
  disk: {
    exists: boolean;
    savedAt?: string;
    ageMinutes?: number;
    salesCount?: number;
    rentalCount?: number;
    totalSizeKB?: number;
  };
}

// ── Bedroom model ──

export interface BedroomRange {
  min: number;
  max: number;
  med: number;
  count: number;
}

export interface BedroomModel {
  byProject: Record<string, Record<string, BedroomRange>>;
  market: Record<string, BedroomRange>;
}

// ── Rental aggregation ──

export interface RentalAggProject {
  avgRent: number;
  avgRentPsf: number;
  count: number;
  totalRent: number;
  totalPsf: number;
}

export interface RentalAggDist {
  avgRent: number;
  avgRentPsf: number;
  count: number;
  totalRent: number;
  totalPsf: number;
  byQ: Record<string, { rent: number; psf: number; n: number }>;
}

export interface RentalAggData {
  byProject: Record<string, RentalAggProject>;
  byDist: Record<string, RentalAggDist>;
  bySeg: Record<string, { avgRent: number; avgRentPsf: number; count: number }>;
  byQtr: Record<string, { rent: number; psf: number; n: number }>;
}

// ── API response ──

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  requestId?: string;
}
