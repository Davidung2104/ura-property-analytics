/**
 * ura-client.js — URA API token management + HTTP client
 * Extracted from uraService.js lines 1-95
 * Handles token refresh, retry logic, URL failover.
 */
import axios from 'axios';
import { sleep } from './helpers.js';

// URA API URLs — eservice is the documented/working one
const URA_URLS = [
  'https://eservice.ura.gov.sg/uraDataService/invokeUraDS/v1',
  'https://www.ura.gov.sg/uraDataService/invokeUraDS',
];
let workingUrl = null;

const TOKEN_URLS = [
  'https://eservice.ura.gov.sg/uraDataService/insertNewToken/v1',
  'https://www.ura.gov.sg/uraDataService/insertNewToken.action',
];

// FIX #5: Token TTL configurable via env var (default 23h, URA's documented lifetime)
const TOKEN_TTL_HOURS = parseFloat(process.env.URA_TOKEN_TTL_HOURS) || 23;

let token = { value: null, fetchedAt: null, expiresAt: null };

export async function refreshToken() {
  console.log('🔑 Refreshing URA token...');
  for (const url of TOKEN_URLS) {
    try {
      const res = await axios.get(url, {
        headers: { 'AccessKey': process.env.URA_ACCESS_KEY }
      });
      if (res.data?.Result) {
        token.value = res.data.Result;
        token.fetchedAt = new Date();
        token.expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 3600000);
        console.log(`✅ Token obtained via ${url.includes('eservice') ? 'eservice' : 'www'}`);
        return token;
      }
    } catch (err) {
      console.log(`  ⚠️ Token ${url.includes('eservice') ? 'eservice' : 'www'}: ${err.message}`);
    }
  }
  throw new Error('Failed to get token from all URLs');
}

async function ensureToken() {
  if (token.value && token.expiresAt && Date.now() < token.expiresAt) return token.value;
  await refreshToken();
  return token.value;
}

export async function uraGet(params, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const t = await ensureToken();
    const headers = { 'AccessKey': process.env.URA_ACCESS_KEY, 'Token': t };
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
          if (err.response?.status === 404) continue;
          throw err;
        }
      }
      throw new Error('All URA API URLs returned 404');
    } catch (err) {
      const isLast = attempt === retries;
      if (isLast) throw err;
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      console.warn(`  ⚠️ URA API attempt ${attempt}/${retries} failed: ${err.message}. Retrying in ${delay}ms...`);
      if (err.response?.status === 401 || err.response?.status === 403) {
        token = { value: null, fetchedAt: null, expiresAt: null };
        workingUrl = null;
      }
      await sleep(delay);
    }
  }
}

export async function fetchBatch(service, batch) {
  return uraGet({ service, batch });
}

export async function fetchRental(refPeriod) {
  return uraGet({ service: 'PMI_Resi_Rental', refPeriod });
}

export function getTokenInfo() {
  return {
    hasToken: !!token.value,
    fetchedAt: token.fetchedAt?.toISOString(),
    expiresAt: token.expiresAt?.toISOString(),
    hoursRemaining: token.expiresAt ? +((token.expiresAt - Date.now()) / 3600000).toFixed(1) : 0,
    isValid: token.value && Date.now() < token.expiresAt,
    tokenTTLHours: TOKEN_TTL_HOURS,
  };
}
