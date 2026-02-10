import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================================
// CONFIG
// ============================================================
const URA_ACCESS_KEY = process.env.URA_ACCESS_KEY;
const URA_TOKEN_URLS = [
  'https://eservice.ura.gov.sg/uraDataService/insertNewToken/v1',
  'https://www.ura.gov.sg/uraDataService/insertNewToken.action',
];
const URA_DATA_URL = 'https://eservice.ura.gov.sg/uraDataService/invokeUraDS/v1';
const FETCH_TIMEOUT_MS = 15000; // 15 second timeout for all fetches

// ============================================================
// CORS - allow your Vercel frontend
// ============================================================
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',').map(s => s.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(allowed => origin.startsWith(allowed))) {
      return callback(null, true);
    }
    callback(null, true);
  }
}));

app.use(express.json());

// ============================================================
// TIMEOUT FETCH - prevents hanging requests
// ============================================================
async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// TOKEN MANAGEMENT - Auto refresh every 23 hours
// ============================================================
let tokenCache = {
  token: process.env.URA_TOKEN || null,
  fetchedAt: process.env.URA_TOKEN ? Date.now() : null,
};

const TOKEN_LIFETIME_MS = 23 * 60 * 60 * 1000;

function isTokenValid() {
  if (!tokenCache.token || !tokenCache.fetchedAt) return false;
  return (Date.now() - tokenCache.fetchedAt) < TOKEN_LIFETIME_MS;
}

async function getToken() {
  if (isTokenValid()) {
    return tokenCache.token;
  }

  if (!URA_ACCESS_KEY) {
    throw new Error('URA_ACCESS_KEY environment variable is not set');
  }

  // Try each token URL
  let lastError = null;
  for (const tokenUrl of URA_TOKEN_URLS) {
    try {
      console.log(`🔑 Fetching token from ${tokenUrl}...`);
      
      const response = await fetchWithTimeout(tokenUrl, {
        method: 'GET',
        headers: {
          'AccessKey': URA_ACCESS_KEY,
          'User-Agent': 'Mozilla/5.0',
        },
      });

      if (!response.ok) {
        const text = await response.text();
        console.warn(`⚠️ Token URL returned ${response.status}: ${text.substring(0, 100)}`);
        lastError = new Error(`Token API returned ${response.status}`);
        continue;
      }

      const data = await response.json();
      console.log('🔑 Token response:', JSON.stringify(data).substring(0, 150));

      const token = data.Result;
      if (!token) {
        console.warn(`⚠️ No token in response from ${tokenUrl}`);
        lastError = new Error(`No token in response: ${JSON.stringify(data).substring(0, 100)}`);
        continue;
      }

      tokenCache = { token, fetchedAt: Date.now() };
      console.log(`✅ New token obtained from ${tokenUrl}`);
      console.log(`   Preview: ${token.substring(0, 20)}...`);
      console.log(`   Valid for ~23 hours`);
      return token;

    } catch (err) {
      console.warn(`⚠️ Token fetch failed from ${tokenUrl}: ${err.message}`);
      lastError = err;
      continue;
    }
  }

  // All URLs failed — try fallback to old token
  if (tokenCache.token) {
    console.log('⚠️ All token URLs failed, using expired token as fallback');
    return tokenCache.token;
  }

  throw lastError || new Error('All token fetch attempts failed');
}

// ============================================================
// DATA CACHE - Cache API responses for 1 hour
// ============================================================
const dataCache = new Map();
const DATA_CACHE_TTL = 60 * 60 * 1000;

function getCachedData(key) {
  const cached = dataCache.get(key);
  if (cached && (Date.now() - cached.fetchedAt) < DATA_CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedData(key, data) {
  dataCache.set(key, { data, fetchedAt: Date.now() });
}

// ============================================================
// URA API PROXY
// ============================================================
async function fetchURAData(url, cacheKey) {
  const cached = getCachedData(cacheKey);
  if (cached) {
    console.log(`📦 Cache hit: ${cacheKey}`);
    return cached;
  }

  const token = await getToken();
  console.log(`📡 Fetching: ${cacheKey}...`);

  const headers = {
    'AccessKey': URA_ACCESS_KEY,
    'Token': token,
    'User-Agent': 'Mozilla/5.0',
  };

  let response;
  try {
    response = await fetchWithTimeout(url, { method: 'GET', headers });
  } catch (err) {
    throw new Error(`Fetch failed for ${cacheKey}: ${err.message}`);
  }

  if (!response.ok) {
    // If 401/403, token might be expired - force refresh and retry once
    if (response.status === 401 || response.status === 403) {
      console.log('🔄 Token rejected, forcing refresh...');
      tokenCache = { token: null, fetchedAt: null };
      const newToken = await getToken();

      const retryResponse = await fetchWithTimeout(url, {
        method: 'GET',
        headers: { ...headers, 'Token': newToken },
      });

      if (!retryResponse.ok) {
        throw new Error(`${cacheKey} failed after token retry: ${retryResponse.status}`);
      }

      const retryData = await retryResponse.json();
      if (Array.isArray(retryData?.Result)) {
        setCachedData(cacheKey, retryData);
      }
      return retryData;
    }

    const text = await response.text().catch(() => '');
    throw new Error(`${cacheKey} returned ${response.status}: ${text.substring(0, 200)}`);
  }

  const data = await response.json();

  // URA sometimes returns HTTP 200 but with Status: "Error" (e.g. token expired)
  if (data?.Status === 'Error' && data?.Message?.toLowerCase().includes('token')) {
    console.log(`🔄 URA returned token error for ${cacheKey}: ${data.Message}`);
    console.log('🔄 Forcing token refresh and retrying...');
    tokenCache = { token: null, fetchedAt: null };
    const newToken = await getToken();

    const retryResponse = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { ...headers, 'Token': newToken },
    });

    if (retryResponse.ok) {
      const retryData = await retryResponse.json();
      if (retryData?.Status !== 'Error' && Array.isArray(retryData?.Result)) {
        setCachedData(cacheKey, retryData);
      }
      return retryData;
    }
    throw new Error(`${cacheKey} failed after token refresh: ${retryResponse.status}`);
  }

  // Only cache valid responses (Result must be an array)
  if (Array.isArray(data?.Result)) {
    setCachedData(cacheKey, data);
  } else {
    console.warn(`⚠️ ${cacheKey}: Result is not an array, skipping cache. Got:`, typeof data?.Result);
  }
  return data;
}

// ============================================================
// ROUTES
// ============================================================

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'URA Property Analytics API',
    version: '3.1.0',
    tokenStatus: isTokenValid() ? 'valid' : 'expired/missing',
    tokenAge: tokenCache.fetchedAt
      ? `${Math.round((Date.now() - tokenCache.fetchedAt) / 1000 / 60)} minutes`
      : 'no token',
    cachedBatches: [...dataCache.keys()],
    uptime: `${Math.round(process.uptime() / 60)} minutes`,
  });
});

// Get transactions by batch (1-4)
app.get('/api/transactions', async (req, res) => {
  try {
    const batch = parseInt(req.query.batch) || 1;
    if (batch < 1 || batch > 4) {
      return res.status(400).json({ error: 'Batch must be 1-4' });
    }
    const url = `${URA_DATA_URL}?service=PMI_Resi_Transaction&batch=${batch}`;
    const data = await fetchURAData(url, `batch-${batch}`);

    // Defensive: ensure Result is an array
    let result = data?.Result;
    if (!Array.isArray(result)) {
      console.error(`❌ Batch ${batch}: Result type = ${typeof result}, value =`, JSON.stringify(result)?.substring(0, 200));
      // Try to recover: if Result is an object with numeric keys, convert
      if (result && typeof result === 'object') {
        result = Object.values(result);
      } else {
        return res.status(502).json({ error: 'URA returned invalid data', resultType: typeof result });
      }
    }

    const projectCount = result.length;
    const txnCount = result.reduce((sum, p) => sum + (p?.transaction?.length || 0), 0);
    console.log(`✅ Batch ${batch}: ${projectCount} projects, ${txnCount} txns`);

    res.json({ Result: result, Status: data?.Status || 'Success' });
  } catch (err) {
    console.error('❌ /api/transactions error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get all batches at once
app.get('/api/transactions/all', async (req, res) => {
  try {
    const allResults = [];
    for (let batch = 1; batch <= 4; batch++) {
      try {
        const url = `${URA_DATA_URL}?service=PMI_Resi_Transaction&batch=${batch}`;
        const data = await fetchURAData(url, `batch-${batch}`);
        let result = data?.Result;
        if (Array.isArray(result)) {
          allResults.push(...result);
        } else if (result && typeof result === 'object') {
          allResults.push(...Object.values(result));
        }
      } catch (err) {
        console.warn(`⚠️ Batch ${batch} failed: ${err.message}`);
        if (batch === 1) throw err;
      }
    }
    res.json({ Result: allResults, Status: 'Success' });
  } catch (err) {
    console.error('❌ /api/transactions/all error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Raw test endpoint - see exactly what URA returns
app.get('/api/raw-test', async (req, res) => {
  try {
    const token = await getToken();
    const service = req.query.service || 'PMI_Resi_Rental';
    const extra = req.query.refPeriod ? `&refPeriod=${req.query.refPeriod}` : req.query.batch ? `&batch=${req.query.batch}` : '';
    const url = `${URA_DATA_URL}?service=${service}${extra}`;
    
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { 'AccessKey': URA_ACCESS_KEY, 'Token': token, 'User-Agent': 'Mozilla/5.0' },
    });
    
    const text = await response.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    
    res.json({
      status: response.status,
      resultType: parsed ? typeof parsed.Result : 'parse-failed',
      resultIsArray: parsed ? Array.isArray(parsed.Result) : false,
      resultLength: parsed && Array.isArray(parsed.Result) ? parsed.Result.length : null,
      resultKeys: parsed && parsed.Result && typeof parsed.Result === 'object' && !Array.isArray(parsed.Result) ? Object.keys(parsed.Result).slice(0, 10) : null,
      topLevelKeys: parsed ? Object.keys(parsed) : null,
      rawPreview: text.substring(0, 500),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get rental data by refPeriod
app.get('/api/rentals', async (req, res) => {
  try {
    const refPeriod = req.query.refPeriod;
    if (!refPeriod) {
      return res.status(400).json({ error: 'refPeriod is required (e.g. 24q1)' });
    }
    const url = `${URA_DATA_URL}?service=PMI_Resi_Rental&refPeriod=${refPeriod}`;
    const data = await fetchURAData(url, `rental-${refPeriod}`);

    // Defensive: ensure Result is an array
    let result = data?.Result;
    if (!Array.isArray(result)) {
      console.error(`❌ Rentals ${refPeriod}: Result type = ${typeof result}, value =`, JSON.stringify(result)?.substring(0, 200));
      if (result && typeof result === 'object') {
        result = Object.values(result);
      } else {
        // Return empty array instead of error for missing periods
        return res.json({ Result: [], Status: 'No Data' });
      }
    }

    const count = result.reduce((sum, p) => sum + (p?.rental?.length || 0), 0);
    console.log(`✅ Rentals ${refPeriod}: ${count} records`);

    res.json({ Result: result, Status: data?.Status || 'Success' });
  } catch (err) {
    console.error(`❌ /api/rentals error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Force token refresh
app.post('/api/refresh-token', async (req, res) => {
  try {
    tokenCache = { token: null, fetchedAt: null };
    const token = await getToken();
    res.json({
      success: true,
      message: 'Token refreshed',
      tokenPreview: token.substring(0, 20) + '...',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Clear data cache
app.post('/api/refresh', async (req, res) => {
  dataCache.clear();
  res.json({ success: true, message: 'Data cache cleared' });
});

// Debug endpoint
app.get('/api/debug', async (req, res) => {
  res.json({
    accessKeySet: !!URA_ACCESS_KEY,
    accessKeyPreview: URA_ACCESS_KEY ? `${URA_ACCESS_KEY.substring(0, 8)}...` : 'NOT SET',
    tokenValid: isTokenValid(),
    tokenPreview: tokenCache.token ? `${tokenCache.token.substring(0, 20)}...` : 'none',
    tokenAge: tokenCache.fetchedAt ? `${Math.round((Date.now() - tokenCache.fetchedAt) / 1000 / 60)} min` : 'n/a',
    tokenSource: tokenCache.fetchedAt ? 'auto-fetched' : (process.env.URA_TOKEN ? 'env-var' : 'none'),
    cachedData: [...dataCache.keys()],
    allowedOrigins,
    nodeVersion: process.version,
    fetchTimeout: `${FETCH_TIMEOUT_MS}ms`,
  });
});

// Stats endpoint
app.get('/api/stats', (req, res) => {
  const now = Date.now();
  res.json({
    token: {
      hasToken: !!tokenCache.token,
      fetchedAt: tokenCache.fetchedAt ? new Date(tokenCache.fetchedAt).toISOString() : null,
      expiresAt: tokenCache.fetchedAt ? new Date(tokenCache.fetchedAt + TOKEN_LIFETIME_MS).toISOString() : null,
      hoursRemaining: tokenCache.fetchedAt ? Math.max(0, Math.round((tokenCache.fetchedAt + TOKEN_LIFETIME_MS - now) / 1000 / 60 / 60 * 10) / 10) : 0,
      isValid: isTokenValid(),
    },
    cache: {
      entries: dataCache.size,
      keys: [...dataCache.keys()],
    },
    uptime: `${Math.round(process.uptime() / 60)} min`,
  });
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, async () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📊 API: http://localhost:${PORT}/api/transactions?batch=1`);
  console.log(`🔍 Debug: http://localhost:${PORT}/api/debug`);
  console.log(`🔑 AccessKey: ${URA_ACCESS_KEY ? URA_ACCESS_KEY.substring(0, 8) + '...' : '❌ NOT SET'}`);
  console.log(`⏱️  Fetch timeout: ${FETCH_TIMEOUT_MS}ms\n`);

  // Pre-fetch token on startup
  if (URA_ACCESS_KEY) {
    try {
      const token = await getToken();
      console.log('✅ Token ready on startup');

      // ========== PRE-WARM CACHE ==========
      // Fetch all data now so first visitor gets instant response
      console.log('🔥 Pre-warming cache...\n');

      // Fetch all 4 transaction batches in parallel
      const batchPromises = [1, 2, 3, 4].map(async (batch) => {
        try {
          const url = `${URA_DATA_URL}?service=PMI_Resi_Transaction&batch=${batch}`;
          await fetchURAData(url, `batch-${batch}`);
          console.log(`  ✅ Batch ${batch} cached`);
        } catch (err) {
          console.warn(`  ⚠️ Batch ${batch} failed: ${err.message}`);
        }
      });
      await Promise.all(batchPromises);

      // Fetch rental quarters in parallel (batches of 6 to not overwhelm URA)
      const now = new Date();
      const refPeriods = [];
      for (let y = now.getFullYear() - 5; y <= now.getFullYear(); y++) {
        for (let q = 1; q <= 4; q++) {
          refPeriods.push(`${String(y).slice(2)}q${q}`);
        }
      }

      for (let i = 0; i < refPeriods.length; i += 6) {
        const chunk = refPeriods.slice(i, i + 6);
        await Promise.all(chunk.map(async (rp) => {
          try {
            const url = `${URA_DATA_URL}?service=PMI_Resi_Rental&refPeriod=${rp}`;
            await fetchURAData(url, `rental-${rp}`);
          } catch (err) {
            // Silent - some future quarters won't have data
          }
        }));
        console.log(`  ✅ Rentals cached: ${chunk.join(', ')}`);
      }

      console.log(`\n🎉 Cache warm! ${dataCache.size} entries ready for instant response\n`);

    } catch (err) {
      console.error('⚠️ Startup token fetch failed:', err.message);
      console.error('   Token will be fetched on first request\n');
    }
  } else {
    console.error('❌ URA_ACCESS_KEY is not set! Add it to environment variables.\n');
  }
});
