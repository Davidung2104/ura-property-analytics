const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const SQM_TO_SQFT = 10.764;

// Normalize a transaction from the backend's flattened format
function normalizeTransaction(tx) {
  const areaSqm = parseFloat(tx.area || tx.areaNum) || 0;
  const price = parseFloat(tx.price || tx.priceNum) || 0;
  const psm = areaSqm > 0 ? price / areaSqm : 0;
  const psf = psm / SQM_TO_SQFT;

  // Parse contractDate - handle both "MMYY" and "YYYY-MM" formats
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
  results.forEach(project => {
    if (project.transaction && Array.isArray(project.transaction)) {
      project.transaction.forEach(tx => {
        const merged = { ...tx, project: project.project, street: project.street, marketSegment: project.marketSegment };
        const norm = normalizeTransaction(merged);
        if (norm.year > 0 && norm.psf > 0) txns.push(norm);
      });
    }
  });
  return txns;
}

// Fetch a single batch
async function fetchBatch(batch) {
  try {
    const res = await fetch(`${API_URL}/api/transactions?batch=${batch}`);
    if (!res.ok) return [];
    const data = await res.json();
    if (data.Result && Array.isArray(data.Result)) {
      console.log(`Batch ${batch}: ${data.Result.length} projects`);
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

// Fetch all transactions - ALL 4 BATCHES IN PARALLEL
export async function getTransactions() {
  const results = await Promise.all([
    fetchBatch(1),
    fetchBatch(2),
    fetchBatch(3),
    fetchBatch(4),
  ]);
  const all = results.flat();
  console.log(`Total transactions loaded: ${all.length}`);
  return all;
}

// Fetch a single rental period
async function fetchRentalPeriod(refPeriod) {
  try {
    const res = await fetch(`${API_URL}/api/rentals?refPeriod=${refPeriod}`);
    if (!res.ok) return [];
    const data = await res.json();

    const results = data.Result || (data.success ? data.data : null);
    if (!results || !Array.isArray(results)) return [];

    const rentals = [];
    if (results.length > 0 && results[0].rental) {
      results.forEach(project => {
        if (project.rental) {
          project.rental.forEach(r => {
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
          });
        }
      });
    }

    console.log(`Rentals ${refPeriod}: ${rentals.length} records`);
    return rentals;
  } catch (err) {
    console.warn(`Rentals ${refPeriod} error:`, err.message);
    return [];
  }
}

// Fetch rental data - ALL QUARTERS IN PARALLEL (batches of 6)
export async function getRentals() {
  const now = new Date();
  const refPeriods = [];
  for (let y = now.getFullYear() - 5; y <= now.getFullYear(); y++) {
    for (let q = 1; q <= 4; q++) {
      const yy = String(y).slice(2);
      refPeriods.push(`${yy}q${q}`);
    }
  }

  // Fetch in batches of 6 to avoid overwhelming the server
  const BATCH_SIZE = 6;
  const allRentals = [];
  for (let i = 0; i < refPeriods.length; i += BATCH_SIZE) {
    const chunk = refPeriods.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(chunk.map(fetchRentalPeriod));
    allRentals.push(...results.flat());
  }

  console.log(`Total rentals loaded: ${allRentals.length}`);
  return allRentals;
}
