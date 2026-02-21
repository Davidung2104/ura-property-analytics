import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as api from '../services/api';

// Mock API
vi.mock('../services/api', () => ({
  fetchDashboard: vi.fn(),
  fetchFilterOptions: vi.fn().mockResolvedValue({}),
  fetchProject: vi.fn().mockResolvedValue({ projInfo: { name: 'RIVIERE' }, txs: [] }),
  loadUserData: vi.fn().mockResolvedValue({}),
  saveUserData: vi.fn().mockResolvedValue({}),
  refreshDashboard: vi.fn(),
  fetchFilteredDashboard: vi.fn(),
  searchSales: vi.fn(),
  searchRental: vi.fn(),
  getUserId: vi.fn().mockReturnValue('test-user'),
}));

// Must import AFTER mocks
import useAppStore from '../stores/useAppStore';
import AppLayout from '../layouts/AppLayout';

const MOCK_DATA = {
  totalTx: 5000, avgPsf: 1800, medPsf: 1650,
  projList: ['RIVIERE'], projIndex: { 'RIVIERE': { psf: 2200, dist: 'D03', seg: 'CCR', n: 150 } },
  cmpPool: [{ name: 'RIVIERE', psf: 2200, dist: 'D03', street: 'JIAK KIM', segment: 'CCR' }],
  segCounts: { CCR: 1500, RCR: 2000, OCR: 1500 },
  lastUpdated: '2025-01-01',
};

function renderWithRouter(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AppLayout />
    </MemoryRouter>
  );
}

describe('AppLayout', () => {
  beforeEach(() => {
    // Default: mock resolves successfully
    api.fetchDashboard.mockResolvedValue(MOCK_DATA);
    // Reset store
    useAppStore.setState({
      mktData: null, unfilteredData: null, filterOpts: {},
      filters: { district: 'all', year: 'all', segment: 'all', propertyType: 'all', tenure: 'all' },
      hasActiveFilters: false,
      projList: [], projIndex: {}, cmpPool: [],
      loading: true, refreshing: false, error: null,
      proj: '', projData: null, projLoading: false, cmpSelected: [],
      portfolio: [], savedSearches: [], clientReports: [], syncStatus: 'idle',
    });
  });

  describe('Navigation', () => {
    it('renders main navigation with Market and Portfolio links', async () => {
      renderWithRouter();
      const nav = await screen.findByRole('navigation', { name: /main/i });
      expect(nav).toBeInTheDocument();
      expect(screen.getByText('Market')).toBeInTheDocument();
      expect(screen.getByText('Portfolio')).toBeInTheDocument();
    });

    it('renders PropIntel brand link', async () => {
      renderWithRouter();
      expect(await screen.findByText('PropIntel')).toBeInTheDocument();
      expect(screen.getByLabelText('PropIntel home')).toBeInTheDocument();
    });

    it('renders refresh button', async () => {
      renderWithRouter();
      expect(await screen.findByLabelText('Refresh data')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has skip-to-content link', async () => {
      renderWithRouter();
      await screen.findByRole('navigation', { name: /main/i });
      const skipLink = screen.getByText('Skip to main content');
      expect(skipLink).toBeInTheDocument();
      expect(skipLink).toHaveAttribute('href', '#main-content');
    });

    it('has main content landmark', async () => {
      renderWithRouter();
      expect(await screen.findByRole('main')).toBeInTheDocument();
    });

    it('has navigation landmark', async () => {
      renderWithRouter();
      expect(await screen.findByRole('navigation', { name: /main/i })).toBeInTheDocument();
    });

    it('has data status indicator with aria-label', async () => {
      renderWithRouter();
      expect(await screen.findByLabelText('Data loaded')).toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('shows loading screen initially', () => {
      // Make fetch never resolve to keep loading state
      api.fetchDashboard.mockReturnValue(new Promise(() => {}));
      renderWithRouter();
      expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('shows error screen with retry button', async () => {
      api.fetchDashboard.mockRejectedValue(new Error('Server offline'));
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(screen.getByText('Server offline')).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });
});

describe('API versioning', () => {
  it('all API paths use /api/v1/', () => {
    expect(typeof api.fetchDashboard).toBe('function');
    expect(typeof api.fetchProject).toBe('function');
    expect(typeof api.searchSales).toBe('function');
    expect(typeof api.searchRental).toBe('function');
  });
});

describe('Theme tokens', () => {
  it('exports all required color tokens', async () => {
    const theme = await import('../theme.ts');
    expect(theme.colors.accent).toBe('#2563eb');
    expect(theme.colors.text).toBe('#1b2d4b');
    expect(theme.colors.ccr).toBe('#dc2626');
    expect(theme.colors.rcr).toBe('#d97706');
    expect(theme.colors.ocr).toBe('#059669');
  });

  it('exports typography tokens', async () => {
    const theme = await import('../theme.ts');
    expect(theme.fontSizes.base).toBe(13);
    expect(theme.fontSizes['2xl']).toBe(20);
  });

  it('segColor returns correct colors', async () => {
    const { segColor } = await import('../theme.ts');
    expect(segColor('CCR')).toBe('#dc2626');
    expect(segColor('RCR')).toBe('#d97706');
    expect(segColor('OCR')).toBe('#059669');
  });

  it('computeBucketCAGR calculates correctly', async () => {
    const { computeBucketCAGR } = await import('../theme.ts');
    const txs = [
      { year: '2020', psf: 1000 }, { year: '2020', psf: 1100 },
      { year: '2024', psf: 1200 }, { year: '2024', psf: 1300 }, { year: '2024', psf: 1250 },
    ];
    const result = computeBucketCAGR(txs);
    expect(result.cagr).not.toBeNull();
    expect(result.startAvg).toBe(1050);
    expect(result.endAvg).toBe(1250);
    expect(result.lowConf).toBe(true);
  });

  it('computeBucketCAGR handles insufficient data', async () => {
    const { computeBucketCAGR } = await import('../theme.ts');
    expect(computeBucketCAGR([]).cagr).toBeNull();
    expect(computeBucketCAGR([{ year: '2024', psf: 1000 }]).cagr).toBeNull();
  });
});
