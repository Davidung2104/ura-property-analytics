const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const SQM_TO_SQFT = 10.764;

// ============================================================
// DATA NORMALIZATION
// ============================================================
function normalizeTransaction(tx) {
  const areaSqm = parseFloat(tx.area || tx.areaNum) || 0;
  const price = parseFloat(tx.price || tx.priceNum) || 0;
  const psm = areaSqm > 0 ? price / areaSqm : 0;
  const psf = psm / SQM_TO_SQFT;

  let contractDate = tx.contractDate || '';
  let year = 0;
  if (contractDate.match(/^\d{4}-\d{2}$/)) {
    year = parseInt(contractDate.split('-')[0]);
  } else if (contractDate.length === 4) {
    const mm = contractDate.substring(0, 2);
    const yy = contractDate.substring(2, 4);
    year = parseInt(yy) > 50 ? 1900 + parseInt(yy) : 2000 + parseInt(yy);
    contractDate = `${year}-${mm}`;
  }

  const rawTenure = tx.tenure || '';
  let tenure = rawTenure;
  if (rawTenure.toLowerCase() === 'freehold' || rawTenure === 'FH') {
    tenure = 'FH';
  } else if (rawTenure.includes('yrs')) {
    const match = rawTenure.match(/(\d+)\s*yrs/);
    tenure = match ? `${match[1]} yrs` : rawTenure;
  }

  return {
    project: tx.project || '',
    street: tx.street || '',
    district: tx.district || '',
    floorRange: tx.floorRange || '',
    areaNum: areaSqm,
    areaSqft: Math.round(areaSqm * SQM_TO_SQFT * 100) / 100,
    priceNum: price,
    psm: Math.round(psm * 100) / 100,
    psf: Math.round(psf * 100) / 100,
    contractDate,
    year,
    marketSegment: tx.marketSegment || '',
    propertyType: tx.propertyType || '',
    tenure,
    tenureRaw: rawTenure,
    typeOfSale: tx.typeOfSale || '',
    typeOfArea: tx.typeOfArea || '',
    noOfUnits: parseInt(tx.noOfUnits) || 1,
  };
}

function processProjectResults(results) {
  const txns = [];
  if (!Array.isArray(results)) return txns;
  for (let i = 0; i < results.length; i++) {
    const project = results[i];
    if (project.transaction && Array.isArray(project.transaction)) {
      for (let j = 0; j < project.transaction.length; j++) {
        const tx = project.transaction[j];
        const merged = { ...tx, project: project.project, street: project.street, marketSegment: project.marketSegment };
        const norm = normalizeTransaction(merged);
        if (norm.year > 0 && norm.psf > 0) txns.push(norm);
      }
    }
  }
  return txns;
}

function processRentalResults(results) {
  const rentals = [];
  if (!Array.isArray(results)) return rentals;
  for (let i = 0; i < results.length; i++) {
    const project = results[i];
    if (project.rental && Array.isArray(project.rental)) {
      for (let j = 0; j < project.rental.length; j++) {
        const r = project.rental[j];
        rentals.push({
          project: project.project || '',
          street: project.street || '',
          district: r.district || '',
          propertyType: r.propertyType || '',
          areaSqm: r.areaSqm || '',
          areaSqft: r.areaSqft || '',
          rent: parseFloat(r.rent) || 0,
          leaseDate: r.leaseDate || '',
          noOfBedRoom: r.noOfBedRoom || '',
          refPeriod: r.refPeriod || '',
        });
      }
    }
  }
  return rentals;
}

// ============================================================
// SINGLE FETCH - 1 request gets everything
// ============================================================
let cachedData = null;

async function fetchAllData() {
  // Return cached if available (same session)
  if (cachedData) return cachedData;

  try {
    console.log('Fetching all data in single request...');
    const res = await fetch(`${API_URL}/api/all-data`);
    if (!res.ok) throw new Error(`all-data returned ${res.status}`);
    const data = await res.json();

    const transactions = processProjectResults(data.transactions?.Result || []);
    const rentals = processRentalResults(data.rentals?.Result || []);

    console.log(`Loaded: ${transactions.length} transactions, ${rentals.length} rentals (single request)`);
    cachedData = { transactions, rentals };
    return cachedData;
  } catch (err) {
    console.warn('all-data endpoint failed, falling back to individual requests:', err.message);
    return null;
  }
}

// ============================================================
// FALLBACK - individual requests if all-data fails
// ============================================================
async function fetchBatch(batch) {
  try {
    const res = await fetch(`${API_URL}/api/transactions?batch=${batch}`);
    if (!res.ok) return [];
    const data = await res.json();
    if (data.Result && Array.isArray(data.Result)) {
      return processProjectResults(data.Result);
    }
    if (data.success && Array.isArray(data.data)) {
      return data.data.map(normalizeTransaction).filter(t => t.year > 0 && t.psf > 0);
    }
    return [];
  } catch (err) {
    console.warn(`Batch ${batch} error:`, err.message);
    return [];
  }
}

async function fetchRentalPeriod(refPeriod) {
  try {
    const res = await fetch(`${API_URL}/api/rentals?refPeriod=${refPeriod}`);
    if (!res.ok) return [];
    const data = await res.json();
    const results = data.Result || (data.success ? data.data : null);
    if (!results || !Array.isArray(results)) return [];
    const rentals = [];
    for (let i = 0; i < results.length; i++) {
      const project = results[i];
      if (project.rental) {
        for (let j = 0; j < project.rental.length; j++) {
          const r = project.rental[j];
          rentals.push({
            project: project.project || '',
            street: project.street || '',
            district: r.district || '',
            propertyType: r.propertyType || '',
            areaSqm: r.areaSqm || '',
            areaSqft: r.areaSqft || '',
            rent: parseFloat(r.rent) || 0,
            leaseDate: r.leaseDate || '',
            noOfBedRoom: r.noOfBedRoom || '',
            refPeriod,
          });
        }
      }
    }
    return rentals;
  } catch (err) {
    console.warn(`Rentals ${refPeriod} error:`, err.message);
    return [];
  }
}

// ============================================================
// EXPORTS
// ============================================================
export async function getTransactions() {
  // Try single endpoint first
  const all = await fetchAllData();
  if (all) return all.transactions;

  // Fallback: parallel batch fetch
  const results = await Promise.all([fetchBatch(1), fetchBatch(2), fetchBatch(3), fetchBatch(4)]);
  let txns = [];
  for (const arr of results) txns = txns.concat(arr);
  console.log(`Total transactions (fallback): ${txns.length}`);
  return txns;
}

export async function getRentals() {
  // Try single endpoint first
  const all = await fetchAllData();
  if (all) return all.rentals;

  // Fallback: parallel rental fetch
  const now = new Date();
  const refPeriods = [];
  for (let y = now.getFullYear() - 5; y <= now.getFullYear(); y++) {
    for (let q = 1; q <= 4; q++) {
      refPeriods.push(`${String(y).slice(2)}q${q}`);
    }
  }
  const BATCH_SIZE = 6;
  let allRentals = [];
  for (let i = 0; i < refPeriods.length; i += BATCH_SIZE) {
    const chunk = refPeriods.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(chunk.map(fetchRentalPeriod));
    for (const arr of results) allRentals = allRentals.concat(arr);
  }
  console.log(`Total rentals (fallback): ${allRentals.length}`);
  return allRentals;
}
