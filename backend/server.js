import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================================
// CONFIG
// ============================================================
const URA_ACCESS_KEY = process.env.URA_ACCESS_KEY;
const URA_TOKEN_URL = 'https://eservice.ura.gov.sg/uraDataService/insertNewToken/v1';
const URA_DATA_URL = 'https://eservice.ura.gov.sg/uraDataService/invokeUraDS/v1';

// ============================================================
// CORS - allow your Vercel frontend
// ============================================================
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',').map(s => s.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(allowed => origin.startsWith(allowed))) {
      return callback(null, true);
    }
    callback(null, true); // Be permissive for now
  }
}));

app.use(express.json());

// ============================================================
// TOKEN MANAGEMENT - Auto refresh every 23 hours
// ============================================================
let tokenCache = {
  token: null,
  fetchedAt: null,
};

const TOKEN_LIFETIME_MS = 23 * 60 * 60 * 1000; // 23 hours (URA tokens last 24h)

function isTokenValid() {
  if (!tokenCache.token || !tokenCache.fetchedAt) return false;
  return (Date.now() - tokenCache.fetchedAt) < TOKEN_LIFETIME_MS;
}

async function getToken() {
  // Return cached token if still valid
  if (isTokenValid()) {
    return tokenCache.token;
  }

  // Fetch new token
  console.log('🔑 Fetching new URA token...');
  
  if (!URA_ACCESS_KEY) {
    throw new Error('URA_ACCESS_KEY environment variable is not set');
  }

  try {
    const response = await fetch(URA_TOKEN_URL, {
      method: 'GET',
      headers: {
        'AccessKey': URA_ACCESS_KEY,
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Token API returned ${response.status}: ${text}`);
    }

    const data = await response.json();
    console.log('🔑 Token API response:', JSON.stringify(data).substring(0, 200));

    // URA returns token in "Result" field
    const token = data.Result;
    if (!token) {
      throw new Error(`No token in response. Full response: ${JSON.stringify(data)}`);
    }

    tokenCache = {
      token: token,
      fetchedAt: Date.now(),
    };

    const expiresIn = Math.round(TOKEN_LIFETIME_MS / 1000 / 60 / 60);
    console.log(`✅ New token obtained, valid for ~${expiresIn} hours`);
    console.log(`   Token preview: ${token.substring(0, 20)}...`);
    
    return token;
  } catch (err) {
    console.error('❌ Token fetch failed:', err.message);
    
    // If we have an old token, try using it anyway
    if (tokenCache.token) {
      console.log('⚠️ Using expired token as fallback');
      return tokenCache.token;
    }
    
    throw err;
  }
}

// ============================================================
// DATA CACHE - Cache API responses for 1 hour
// ============================================================
const dataCache = new Map(); // key: "batch-N" → { data, fetchedAt }
const DATA_CACHE_TTL = 60 * 60 * 1000; // 1 hour

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
async function fetchURABatch(batch) {
  const cacheKey = `batch-${batch}`;
  
  // Check cache first
  const cached = getCachedData(cacheKey);
  if (cached) {
    console.log(`📦 Cache hit for batch ${batch}`);
    return cached;
  }

  // Get valid token
  const token = await getToken();

  console.log(`📡 Fetching URA batch ${batch}...`);
  const url = `${URA_DATA_URL}?service=PMI_Resi_Transaction&batch=${batch}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'AccessKey': URA_ACCESS_KEY,
      'Token': token,
      'User-Agent': 'Mozilla/5.0',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    
    // If 401/403, token might be expired - force refresh and retry once
    if (response.status === 401 || response.status === 403) {
      console.log('🔄 Token rejected, forcing refresh...');
      tokenCache = { token: null, fetchedAt: null };
      const newToken = await getToken();
      
      const retryResponse = await fetch(url, {
        method: 'GET',
        headers: {
          'AccessKey': URA_ACCESS_KEY,
          'Token': newToken,
          'User-Agent': 'Mozilla/5.0',
        },
      });
      
      if (!retryResponse.ok) {
        throw new Error(`URA API batch ${batch} failed after retry: ${retryResponse.status}`);
      }
      
      const retryData = await retryResponse.json();
      setCachedData(cacheKey, retryData);
      return retryData;
    }
    
    throw new Error(`URA API batch ${batch} returned ${response.status}: ${text.substring(0, 200)}`);
  }

  const data = await response.json();
  
  const projectCount = data.Result?.length || 0;
  const txnCount = data.Result?.reduce((sum, p) => sum + (p.transaction?.length || 0), 0) || 0;
  console.log(`✅ Batch ${batch}: ${projectCount} projects, ${txnCount} transactions`);
  
  setCachedData(cacheKey, data);
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
    version: '3.0.0',
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
    
    const data = await fetchURABatch(batch);
    res.json(data);
  } catch (err) {
    console.error('❌ /api/transactions error:', err.message);
    res.status(500).json({ 
      error: err.message,
      hint: 'Check URA_ACCESS_KEY is correct and URA API is accessible'
    });
  }
});

// Get all batches at once (convenience endpoint)
app.get('/api/transactions/all', async (req, res) => {
  try {
    const allResults = [];
    
    for (let batch = 1; batch <= 4; batch++) {
      try {
        const data = await fetchURABatch(batch);
        if (data.Result) {
          allResults.push(...data.Result);
        }
      } catch (err) {
        console.warn(`⚠️ Batch ${batch} failed: ${err.message}`);
        if (batch === 1) throw err; // First batch must succeed
      }
    }
    
    res.json({ Result: allResults, Status: 'Success' });
  } catch (err) {
    console.error('❌ /api/transactions/all error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get rental data by refPeriod (e.g. 24q1, 23q4)
app.get('/api/rentals', async (req, res) => {
  try {
    const refPeriod = req.query.refPeriod;
    if (!refPeriod) {
      return res.status(400).json({ error: 'refPeriod is required (e.g. 24q1)' });
    }

    const cacheKey = `rental-${refPeriod}`;
    const cached = getCachedData(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const token = await getToken();
    const url = `${URA_DATA_URL}?service=PMI_Resi_Rental&refPeriod=${refPeriod}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'AccessKey': URA_ACCESS_KEY,
        'Token': token,
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        tokenCache = { token: null, fetchedAt: null };
        const newToken = await getToken();
        const retry = await fetch(url, { method: 'GET', headers: { 'AccessKey': URA_ACCESS_KEY, 'Token': newToken, 'User-Agent': 'Mozilla/5.0' } });
        if (!retry.ok) throw new Error(`Rental API failed after retry: ${retry.status}`);
        const retryData = await retry.json();
        setCachedData(cacheKey, retryData);
        return res.json(retryData);
      }
      throw new Error(`Rental API returned ${response.status}`);
    }

    const data = await response.json();
    const count = data.Result?.reduce((sum, p) => sum + (p.rental?.length || 0), 0) || 0;
    console.log(`✅ Rentals ${refPeriod}: ${count} records`);
    setCachedData(cacheKey, data);
    res.json(data);
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
  const info = {
    accessKeySet: !!URA_ACCESS_KEY,
    accessKeyPreview: URA_ACCESS_KEY ? `${URA_ACCESS_KEY.substring(0, 8)}...` : 'NOT SET',
    tokenValid: isTokenValid(),
    tokenPreview: tokenCache.token ? `${tokenCache.token.substring(0, 20)}...` : 'none',
    tokenAge: tokenCache.fetchedAt ? `${Math.round((Date.now() - tokenCache.fetchedAt) / 1000 / 60)} min` : 'n/a',
    cachedBatches: [...dataCache.keys()],
    allowedOrigins,
    nodeVersion: process.version,
  };
  res.json(info);
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, async () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📊 API: http://localhost:${PORT}/api/transactions?batch=1`);
  console.log(`🔍 Debug: http://localhost:${PORT}/api/debug`);
  console.log(`🔑 AccessKey: ${URA_ACCESS_KEY ? URA_ACCESS_KEY.substring(0, 8) + '...' : '❌ NOT SET'}\n`);
  
  // Pre-fetch token on startup
  if (URA_ACCESS_KEY) {
    try {
      await getToken();
      console.log('✅ Token ready on startup\n');
    } catch (err) {
      console.error('⚠️ Startup token fetch failed:', err.message);
      console.error('   Token will be fetched on first request\n');
    }
  } else {
    console.error('❌ URA_ACCESS_KEY is not set! Add it to environment variables.\n');
  }
});
