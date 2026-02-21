/**
 * types.ts — Shared TypeScript interfaces for PropIntel
 *
 * All data shapes flowing between API, stores, and components are defined here.
 * Components consuming these types get compile-time safety and IDE autocomplete.
 */

// ── API Response wrapper ──
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

// ── Market Dashboard ──
export interface MarketData {
  totalTx: number;
  totalVolume?: number;
  avgPsf: number;
  medPsf: number;
  psfP5?: number;
  psfP25?: number;
  psfP75?: number;
  psfP95?: number;
  yoyPct?: number;
  psfPeriod?: string;
  latestYear?: string;

  // Rental
  avgRent?: number;
  medRent?: number;
  avgRentPsf?: string;
  rentalTotal?: number;
  rentalPeriod?: string;
  hasRealRental?: boolean;
  rentalSegCounts?: SegmentCounts;

  // Segments
  segCounts?: SegmentCounts;
  avgCagr?: number;

  // Performance
  cagrData?: CagrEntry[];
  distPerf?: DistrictPerf[];

  // Yield
  bestYield?: { d: string; y: string; seg: string };
  avgYield?: string;
  yd?: Array<{ d: string; y: number }>;

  // Structural
  projList: string[];
  projIndex: Record<string, ProjectSummary>;
  cmpPool: CompProject[];
  lastUpdated?: string;

  // Market tab data
  sSeg?: SegmentMetric[];
  rSeg?: SegmentMetric[];
  sTrend?: TrendPoint[];
  rTrend?: TrendPoint[];
  sDistTrend?: DistrictTrend[];
  rDistTrend?: DistrictTrend[];
  sDistPsf?: DistrictPsf[];
  rDistPsf?: DistrictPsf[];
  topProj?: TopProject[];
  topRentProj?: TopProject[];
  distTopPsf?: DistrictTopPsf[];
  psfDist?: PsfDistBucket[];
  rentDist?: PsfDistBucket[];
  sScatter?: ScatterPoint[];
  rScatter?: ScatterPoint[];
  qVol?: QuarterlyVolume[];
  rQVol?: QuarterlyVolume[];
  projPerf?: ProjectPerf[];
}

export interface SegmentCounts {
  CCR: number;
  RCR: number;
  OCR: number;
}

export interface SegmentMetric {
  name: string;
  val: number;
  count: number;
}

export interface TrendPoint {
  q: string;
  avg: number;
  med: number;
  vol: number;
  yoy?: number;
}

export interface DistrictTrend {
  q: string;
  [district: string]: number | string;
}

export interface DistrictPsf {
  d: string;
  psf: number;
  n: number;
}

export interface DistrictTopPsf {
  dist: string;
  psf: number;
  vol: number;
  top?: Array<{ name: string; psf: number; vol: number; seg?: string; tenure?: string }>;
}

export interface TopProject {
  name: string;
  psf: number;
  vol: number;
  seg?: string;
}

export interface PsfDistBucket {
  range: string;
  count: number;
}

export interface ScatterPoint {
  area: number;
  psf: number;
  floor?: number;
}

export interface QuarterlyVolume {
  q: string;
  vol: number;
  dollarVol?: number;
}

export interface CagrEntry {
  d: string;
  cagr: number;
  cagrYears: number;
  startAvg: number;
  endAvg: number;
  absDiff: number;
}

export interface DistrictPerf {
  d: string;
  startYear: string;
  endYear: string;
  cagr: number;
  startPsf: number;
  endPsf: number;
  absDiff: number;
  vol: number;
  lowConf?: boolean;
}

export interface ProjectPerf extends DistrictPerf {
  name: string;
  dist: string;
  seg: string;
}

// ── Project ──
export interface ProjectSummary {
  psf: number;
  dist: string;
  seg: string;
  n: number;
  name?: string;
  street?: string;
  type?: string;
  tenure?: string;
  units?: number;
  yield?: string;
  hasRealRental?: boolean;
  district?: string;
  distAvg?: number;
  rentPsf?: string;
  avgRent?: number;
}

export interface CompProject {
  name: string;
  psf: number;
  dist: string;
  street: string;
  segment: string;
  yield?: string;
  n?: number;
  rent?: number;
}

export interface ProjectData {
  projInfo: ProjectSummary;
  txs: Transaction[];
  projTx?: Transaction[];
  projRentTx?: RentalTransaction[];
  nearbyProjects?: NearbyProject[];
  floorData?: FloorBand[];
  floorPeriod?: string;
  heatmap?: HeatmapData;
  [key: string]: unknown;
}

export interface Transaction {
  date: string;
  psf: number;
  price: number;
  area: number;
  year: string;
  floorRange?: string;
  saleType?: string;
  bedrooms?: string;
  district?: string;
  project?: string;
  leaseDate?: string;
  contracts?: number;
}

export interface RentalTransaction {
  date: string;
  rent: number;
  area?: string;
  bedrooms?: string;
  leaseDate?: string;
  contracts?: number;
  district?: string;
  project?: string;
}

export interface NearbyProject {
  name: string;
  rel: 'street' | 'district';
  psf?: number;
  dist?: string;
  seg?: string;
  n?: number;
}

export interface FloorBand {
  range: string;
  psf: number;
  count: number;
  prem?: number;
  thin?: boolean;
}

export interface HeatmapData {
  years: string[];
  floors: string[];
  cells: Record<string, Record<string, { psf: number; price: number; vol: number }>>;
}

// ── Filters ──
export interface Filters {
  district: string;
  year: string;
  segment: string;
  propertyType: string;
  tenure: string;
}

export interface FilterOptions {
  districts?: string[];
  years?: string[];
  segments?: string[];
  propertyTypes?: string[];
  tenures?: string[];
}

// ── Master Filters (project-level) ──
export interface MasterFilters {
  beds: string;
  yearFrom: string;
  yearTo: string;
  type: string;
  tenure: string;
  floor: string;
}

// ── User Data ──
export interface SavedSearch {
  name: string;
  filters: Filters;
  tab: string;
  createdAt: string;
}

export interface PortfolioEntry {
  name: string;
  addedAt: string;
  area?: number;
  floor?: string;
  purchasePrice?: number;
  purchasePsf?: number;
  purchaseDate?: string;
}

export interface ClientReport {
  id: string;
  projectName: string;
  clientName?: string;
  savedAt: string;
  unitConfig?: { area: number; floor?: string };
  evidence?: Transaction[];
  referenceTx?: Record<string, unknown>;
  sections?: Record<string, boolean>;
}

export interface UserData {
  portfolio: PortfolioEntry[];
  savedSearches: SavedSearch[];
  clientReports: ClientReport[];
}

// ── Store ──
export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface AppState {
  // Market
  mktData: MarketData | null;
  unfilteredData: MarketData | null;
  filterOpts: FilterOptions;
  filters: Filters;
  filtering: boolean;
  hasActiveFilters: boolean;

  // Shared
  projList: string[];
  projIndex: Record<string, ProjectSummary>;
  cmpPool: CompProject[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;

  // Project
  proj: string;
  projData: ProjectData | null;
  projLoading: boolean;
  cmpSelected: string[];

  // User
  portfolio: PortfolioEntry[];
  savedSearches: SavedSearch[];
  clientReports: ClientReport[];
  syncStatus: SyncStatus;
}

// ── Paginated Search Results ──
export interface SearchResults<T> {
  results: T[];
  total: number;
  page: number;
  pages: number;
}

// ── Valuation ──
export interface ValuationModel {
  wAvgPsf: number;
  lowPsf: number;
  highPsf: number;
  lo: number;
  hi: number;
  totalTx: number;
  recent6mo: number;
  recent12mo: number;
  sizeMatches: number;
  floorMatches?: number;
  topComps: Transaction[];
}

export interface PriceTier {
  id: number;
  label: string;
  desc: string;
  ic: string;
  c: string;
  m3: TimeWindowData;
  m6: TimeWindowData;
  m12: TimeWindowData;
}

export interface TimeWindowData {
  psf: number;
  cnt: number;
  txs: Transaction[];
}

export interface TimeAdjustment {
  adjPsf: number;
  months: number;
  rate: number | null;
}
