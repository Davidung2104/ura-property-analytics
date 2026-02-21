// ═══════════════════════════════════════════════════════
// ura-client.ts — URA API token management + HTTP client
// Handles token refresh, retry logic, URL failover.
// ═══════════════════════════════════════════════════════
import axios, { type AxiosError } from 'axios';
import { sleep } from './helpers.ts';
import type { TokenInfo, UraProject } from '../types.ts';

const URA_URLS = [
  'https://eservice.ura.gov.sg/uraDataService/invokeUraDS/v1',
  'https://www.ura.gov.sg/uraDataService/invokeUraDS',
];
let workingUrl: string | null = null;

const TOKEN_URLS = [
  'https://eservice.ura.gov.sg/uraDataService/insertNewToken/v1',
  'https://www.ura.gov.sg/uraDataService/insertNewToken.action',
];

const TOKEN_TTL_HOURS = parseFloat(process.env.URA_TOKEN_TTL_HOURS || '') || 23;

interface TokenState {
  value: string | null;
  fetchedAt: Date | null;
  expiresAt: Date | null;
}

let token: TokenState = { value: null, fetchedAt: null, expiresAt: null };

export async function refreshToken(): Promise<TokenState> {
  console.log('🔑 Refreshing URA token...');
  for (const url of TOKEN_URLS) {
    try {
      const res = await axios.get(url, {
        headers: { 'AccessKey': process.env.URA_ACCESS_KEY! }
      });
      if (res.data?.Result) {
        token.value = res.data.Result;
        token.fetchedAt = new Date();
        token.expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 3600000);
        console.log(`✅ Token obtained via ${url.includes('eservice') ? 'eservice' : 'www'}`);
        return token;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ⚠️ Token ${url.includes('eservice') ? 'eservice' : 'www'}: ${msg}`);
    }
  }
  throw new Error('Failed to get token from all URLs');
}

async function ensureToken(): Promise<string> {
  if (token.value && token.expiresAt && Date.now() < token.expiresAt.getTime()) return token.value;
  await refreshToken();
  return token.value!;
}

export async function uraGet(params: Record<string, string | number>, retries = 3): Promise<UraProject[]> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const t = await ensureToken();
    const headers = { 'AccessKey': process.env.URA_ACCESS_KEY!, 'Token': t };
    try {
      if (workingUrl) {
        const res = await axios.get(workingUrl, { params, headers, timeout: 30_000 });
        return res.data?.Result || [];
      }
      for (const url of URA_URLS) {
        try {
          console.log(`  🌐 Trying ${url.replace('https://', '').split('/')[0]}...`);
          const res = await axios.get(url, { params, headers, timeout: 30_000 });
          workingUrl = url;
          console.log(`  ✅ Using ${url.replace('https://', '').split('/')[0]}`);
          return res.data?.Result || [];
        } catch (err) {
          if ((err as AxiosError).response?.status === 404) continue;
          throw err;
        }
      }
      throw new Error('All URA API URLs returned 404');
    } catch (err) {
      const isLast = attempt === retries;
      if (isLast) throw err;
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  ⚠️ URA API attempt ${attempt}/${retries} failed: ${msg}. Retrying in ${delay}ms...`);
      const status = (err as AxiosError).response?.status;
      if (status === 401 || status === 403) {
        token = { value: null, fetchedAt: null, expiresAt: null };
        workingUrl = null;
      }
      await sleep(delay);
    }
  }
  return []; // unreachable but satisfies TS
}

export async function fetchBatch(service: string, batch: number): Promise<UraProject[]> {
  return uraGet({ service, batch });
}

export async function fetchRental(refPeriod: string): Promise<unknown[]> {
  return uraGet({ service: 'PMI_Resi_Rental', refPeriod });
}

export function getTokenInfo(): TokenInfo & { hoursRemaining: number; isValid: boolean; tokenTTLHours: number; fetchedAt?: string } {
  return {
    hasToken: !!token.value,
    fetchedAt: token.fetchedAt?.toISOString() ?? undefined,
    expiresAt: token.expiresAt?.toISOString() ?? null,
    ageMinutes: token.fetchedAt ? Math.round((Date.now() - token.fetchedAt.getTime()) / 60000) : null,
    hoursRemaining: token.expiresAt ? +((token.expiresAt.getTime() - Date.now()) / 3600000).toFixed(1) : 0,
    isValid: !!(token.value && token.expiresAt && Date.now() < token.expiresAt.getTime()),
    tokenTTLHours: TOKEN_TTL_HOURS,
  };
}
