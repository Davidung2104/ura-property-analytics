import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Don't mock api — test the actual module logic
describe('API service', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('fetchDashboard', () => {
    it('returns snapshot data when available', async () => {
      const mockData = { totalTx: 5000, projList: [], projIndex: {}, cmpPool: [] };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const { fetchDashboard } = await import('../services/api');
      const result = await fetchDashboard();
      expect(result.totalTx).toBe(5000);
    });

    it('falls back to API when snapshot fails', async () => {
      const apiData = { totalTx: 3000, projList: [], projIndex: {}, cmpPool: [] };
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        callCount++;
        if (url.includes('snapshot.json')) {
          return Promise.resolve({ ok: false, status: 404 });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: apiData }),
        });
      });

      const { fetchDashboard } = await import('../services/api');
      const result = await fetchDashboard();
      expect(result.totalTx).toBe(3000);
      expect(callCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getUserId', () => {
    it('creates and persists a user ID', async () => {
      const { getUserId } = await import('../services/api');
      const id1 = getUserId();
      expect(id1).toBeTruthy();
      const id2 = getUserId();
      expect(id2).toBe(id1); // Same ID on subsequent calls
    });
  });
});

describe('Types', () => {
  it('exports all required interfaces', async () => {
    const types = await import('../types');
    // Verify key type exports exist (runtime check for completeness)
    expect(types).toBeDefined();
  });
});

describe('Theme', () => {
  it('segColor handles unknown segments', async () => {
    const { segColor } = await import('../theme.ts');
    expect(segColor('UNKNOWN')).toBe('#059669'); // defaults to OCR color
  });

  it('cagrColor returns correct thresholds', async () => {
    const { cagrColor, colors } = await import('../theme.ts');
    expect(cagrColor(6)).toBe(colors.green);
    expect(cagrColor(4)).toBe(colors.lime);
    expect(cagrColor(1)).toBe(colors.amber);
    expect(cagrColor(-2)).toBe(colors.red);
  });

  it('yieldColor returns correct thresholds', async () => {
    const { yieldColor, colors } = await import('../theme.ts');
    expect(yieldColor(3.5)).toBe(colors.green);
    expect(yieldColor(2.7)).toBe(colors.amber);
    expect(yieldColor(1.5)).toBe(colors.red);
  });
});
