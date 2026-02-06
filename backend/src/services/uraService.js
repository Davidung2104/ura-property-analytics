import axios from 'axios';

const URA_BASE_URL = 'https://eservice.ura.gov.sg/uraDataService/invokeUraDS/v1';
const URA_TOKEN_URL = 'https://www.ura.gov.sg/uraDataService/insertNewToken.action';

// Batch to District mapping
const BATCH_INFO = {
  1: { districts: '01-07', description: 'Central, Marina, Raffles, Tanjong Pagar, Bukit Merah' },
  2: { districts: '08-14', description: 'Little India, Orchard, Newton, Toa Payoh, Geylang' },
  3: { districts: '15-21', description: 'East Coast, Bedok, Tampines, Pasir Ris, Serangoon, Bishan' },
  4: { districts: '22-28', description: 'Jurong, Clementi, Bukit Batok, Choa Chu Kang, Yishun, Woodlands' }
};

// Token cache
let tokenCache = {
  token: null,
  fetchedAt: null,
  expiresAt: null
};

// Data cache
let cache = {
  data: null,
  lastFetched: null,
  ttl: 60 * 60 * 1000, // 1 hour cache
  batchStats: null
};

/**
 * Get a fresh token from URA API
 * Tokens are valid for 24 hours
 */
async function fetchNewToken() {
  console.log('🔑 Fetching new URA token...');
  
  try {
    const response = await axios.get(URA_TOKEN_URL, {
      headers: {
        'AccessKey': process.env.URA_ACCESS_KEY
      }
    });
    
    // URA returns token in Result field
    const newToken = response.data.Result;
    
    if (!newToken) {
      throw new Error('No token returned from URA API');
    }
    
    // Cache token for 23 hours (refresh 1 hour before expiry)
    tokenCache = {
      token: newToken,
      fetchedAt: Date.now(),
      expiresAt: Date.now() + (23 * 60 * 60 * 1000) // 23 hours
    };
    
    console.log('✅ New token obtained, valid for 23 hours');
    return newToken;
    
  } catch (error) {
    console.error('❌ Token fetch error:', error.message);
    throw new Error(`Failed to get URA token: ${error.message}`);
  }
}

/**
 * Get valid token (auto-refresh if expired)
 */
async function getValidToken() {
  // Check if we have a valid cached token
  if (tokenCache.token && tokenCache.expiresAt && Date.now() < tokenCache.expiresAt) {
    const hoursLeft = Math.round((tokenCache.expiresAt - Date.now()) / 1000 / 60 / 60);
    console.log(`🔑 Using cached token (${hoursLeft}h remaining)`);
    return tokenCache.token;
  }
  
  // Token expired or doesn't exist - fetch new one
  return await fetchNewToken();
}

/**
 * Fetch data from URA API for a specific batch
 */
async function fetchFromURA(batch) {
  console.log(`📥 Fetching batch ${batch} (Districts ${BATCH_INFO[batch].districts})...`);
  
  // Get valid token (auto-refreshes if needed)
  const token = await getValidToken();
  
  const response = await axios.get(URA_BASE_URL, {
    params: {
      service: 'PMI_Resi_Transaction',
      batch: batch
    },
    headers: {
      'AccessKey': process.env.URA_ACCESS_KEY,
      'Token': token
    }
  });
  
  return response.data;
}

/**
 * Fetch all 4 batches from URA API
 * Batch 1: Districts 01-07
 * Batch 2: Districts 08-14
 * Batch 3: Districts 15-21
 * Batch 4: Districts 22-28
 */
async function fetchAllBatches() {
  const allResults = [];
  const batchStats = {};
  
  // Fetch all 4 batches
  for (let batch = 1; batch <= 4; batch++) {
    try {
      const data = await fetchFromURA(batch);
      
      if (data.Status === 'Success' && data.Result && data.Result.length > 0) {
        const projectCount = data.Result.length;
        const transactionCount = data.Result.reduce(
          (sum, project) => sum + (project.transaction?.length || 0), 
          0
        );
        
        allResults.push(...data.Result);
        batchStats[batch] = { 
          projects: projectCount, 
          transactions: transactionCount,
          districts: BATCH_INFO[batch].districts
        };
        
        console.log(`✅ Batch ${batch}: ${projectCount} projects, ${transactionCount} transactions`);
      } else {
        console.warn(`⚠️ Batch ${batch}: No data or failed - Status: ${data.Status}`);
        batchStats[batch] = { projects: 0, transactions: 0, error: data.Status };
      }
    } catch (error) {
      console.error(`❌ Batch ${batch} error:`, error.message);
      batchStats[batch] = { projects: 0, transactions: 0, error: error.message };
    }
  }
  
  // Store batch stats for debugging
  cache.batchStats = batchStats;
  
  const totalProjects = allResults.length;
  const totalTransactions = allResults.reduce(
    (sum, project) => sum + (project.transaction?.length || 0), 
    0
  );
  
  console.log(`📊 Total: ${totalProjects} projects, ${totalTransactions} transactions from all batches`);
  
  return allResults;
}

/**
 * Get cached data or fetch fresh
 */
export async function getTransactionData(forceRefresh = false) {
  const now = Date.now();
  
  if (!forceRefresh && cache.data && (now - cache.lastFetched) < cache.ttl) {
    console.log('📦 Returning cached data');
    return cache.data;
  }
  
  console.log('🔄 Fetching fresh data from URA API...');
  const data = await fetchAllBatches();
  
  cache.data = data;
  cache.lastFetched = now;
  
  return data;
}

/**
 * Parse contract date (MMYY format) to Date object
 */
function parseContractDate(contractDate) {
  const month = parseInt(contractDate.substring(0, 2)) - 1;
  const year = 2000 + parseInt(contractDate.substring(2, 4));
  return new Date(year, month);
}

/**
 * Get district summary with average prices
 */
export async function getDistrictSummary() {
  const data = await getTransactionData();
  const districtMap = new Map();
  
  data.forEach(project => {
    project.transaction?.forEach(tx => {
      const district = tx.district;
      const price = parseFloat(tx.price);
      const area = parseFloat(tx.area);
      const psf = area > 0 ? price / area : 0;
      
      if (!districtMap.has(district)) {
        districtMap.set(district, {
          district,
          totalTransactions: 0,
          totalValue: 0,
          totalArea: 0,
          prices: []
        });
      }
      
      const stats = districtMap.get(district);
      stats.totalTransactions++;
      stats.totalValue += price;
      stats.totalArea += area;
      stats.prices.push(psf);
    });
  });
  
  return Array.from(districtMap.values())
    .map(stats => ({
      district: `D${stats.district.padStart(2, '0')}`,
      districtNum: parseInt(stats.district),
      transactions: stats.totalTransactions,
      avgPrice: Math.round(stats.totalValue / stats.totalTransactions),
      avgPsf: Math.round(stats.prices.reduce((a, b) => a + b, 0) / stats.prices.length),
      totalValue: stats.totalValue
    }))
    .sort((a, b) => a.districtNum - b.districtNum);
}

/**
 * Get property type breakdown
 */
export async function getPropertyTypeSummary() {
  const data = await getTransactionData();
  const typeMap = new Map();
  
  data.forEach(project => {
    project.transaction?.forEach(tx => {
      const type = tx.propertyType || 'Unknown';
      const price = parseFloat(tx.price);
      const area = parseFloat(tx.area);
      
      if (!typeMap.has(type)) {
        typeMap.set(type, {
          type,
          count: 0,
          totalValue: 0,
          totalArea: 0
        });
      }
      
      const stats = typeMap.get(type);
      stats.count++;
      stats.totalValue += price;
      stats.totalArea += area;
    });
  });
  
  return Array.from(typeMap.values())
    .map(stats => ({
      type: stats.type,
      count: stats.count,
      avgPrice: Math.round(stats.totalValue / stats.count),
      avgPsf: stats.totalArea > 0 ? Math.round(stats.totalValue / stats.totalArea) : 0,
      totalValue: stats.totalValue
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Search projects by name
 */
export async function searchProjects(query, filters = {}) {
  const data = await getTransactionData();
  
  let results = data.map(project => {
    const transactions = project.transaction || [];
    const prices = transactions.map(t => parseFloat(t.price));
    const areas = transactions.map(t => parseFloat(t.area));
    const totalValue = prices.reduce((a, b) => a + b, 0);
    const totalArea = areas.reduce((a, b) => a + b, 0);
    
    return {
      project: project.project,
      street: project.street,
      marketSegment: project.marketSegment,
      district: transactions[0]?.district,
      propertyType: transactions[0]?.propertyType,
      tenure: transactions[0]?.tenure,
      transactionCount: transactions.length,
      avgPrice: transactions.length > 0 ? Math.round(totalValue / transactions.length) : 0,
      avgPsf: totalArea > 0 ? Math.round(totalValue / totalArea) : 0,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      latestTransaction: transactions.length > 0 
        ? transactions.reduce((latest, tx) => {
            const current = parseContractDate(tx.contractDate);
            const prev = parseContractDate(latest.contractDate);
            return current > prev ? tx : latest;
          }, transactions[0])
        : null
    };
  });
  
  // Apply search query
  if (query) {
    const q = query.toLowerCase();
    results = results.filter(p => 
      p.project?.toLowerCase().includes(q) ||
      p.street?.toLowerCase().includes(q)
    );
  }
  
  // Apply filters
  if (filters.district) {
    results = results.filter(p => p.district === filters.district);
  }
  
  if (filters.propertyType) {
    results = results.filter(p => p.propertyType === filters.propertyType);
  }
  
  if (filters.minPrice) {
    results = results.filter(p => p.avgPrice >= parseFloat(filters.minPrice));
  }
  
  if (filters.maxPrice) {
    results = results.filter(p => p.avgPrice <= parseFloat(filters.maxPrice));
  }
  
  return results.sort((a, b) => b.transactionCount - a.transactionCount);
}

/**
 * Get all transactions with optional filters
 */
export async function getTransactions(filters = {}) {
  const data = await getTransactionData();
  let transactions = [];
  
  data.forEach(project => {
    project.transaction?.forEach(tx => {
      transactions.push({
        project: project.project,
        street: project.street,
        marketSegment: project.marketSegment,
        ...tx,
        contractDate: parseContractDate(tx.contractDate).toISOString().slice(0, 7),
        priceNum: parseFloat(tx.price),
        areaNum: parseFloat(tx.area),
        psf: parseFloat(tx.area) > 0 
          ? Math.round(parseFloat(tx.price) / parseFloat(tx.area)) 
          : 0
      });
    });
  });
  
  // Apply filters
  if (filters.district) {
    transactions = transactions.filter(t => t.district === filters.district);
  }
  
  if (filters.propertyType) {
    transactions = transactions.filter(t => t.propertyType === filters.propertyType);
  }
  
  return transactions;
}

/**
 * Get filter options
 */
export async function getFilterOptions() {
  const data = await getTransactionData();
  const districts = new Set();
  const propertyTypes = new Set();
  const marketSegments = new Set();
  
  data.forEach(project => {
    if (project.marketSegment) marketSegments.add(project.marketSegment);
    project.transaction?.forEach(tx => {
      if (tx.district) districts.add(tx.district);
      if (tx.propertyType) propertyTypes.add(tx.propertyType);
    });
  });
  
  return {
    districts: Array.from(districts).sort((a, b) => parseInt(a) - parseInt(b)),
    propertyTypes: Array.from(propertyTypes).sort(),
    marketSegments: Array.from(marketSegments).sort()
  };
}

/**
 * Get batch statistics for monitoring
 */
export function getBatchStats() {
  return {
    batchInfo: BATCH_INFO,
    batchStats: cache.batchStats,
    lastFetched: cache.lastFetched ? new Date(cache.lastFetched).toISOString() : null,
    cacheAge: cache.lastFetched ? Math.round((Date.now() - cache.lastFetched) / 1000 / 60) + ' minutes' : null,
    totalProjects: cache.data?.length || 0,
    token: {
      hasToken: !!tokenCache.token,
      fetchedAt: tokenCache.fetchedAt ? new Date(tokenCache.fetchedAt).toISOString() : null,
      expiresAt: tokenCache.expiresAt ? new Date(tokenCache.expiresAt).toISOString() : null,
      hoursRemaining: tokenCache.expiresAt ? Math.round((tokenCache.expiresAt - Date.now()) / 1000 / 60 / 60) : null
    }
  };
}

/**
 * Manually refresh token (for API endpoint)
 */
export async function refreshToken() {
  const token = await fetchNewToken();
  return {
    success: true,
    message: 'Token refreshed successfully',
    expiresAt: new Date(tokenCache.expiresAt).toISOString()
  };
}
