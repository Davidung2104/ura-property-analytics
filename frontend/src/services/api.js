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
    // Already in YYYY-MM format (from old backend)
    year = parseInt(contractDate.split('-')[0]);
  } else if (contractDate.length === 4) {
    // MMYY format from raw URA
    const mm = contractDate.substring(0, 2);
    const yy = contractDate.substring(2, 4);
    year = parseInt(yy) > 50 ? 1900 + parseInt(yy) : 2000 + parseInt(yy);
    contractDate = `${year}-${mm}`;
  }

  // Normalize tenure
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

// Fetch transactions - handles both old backend (flattened) and new backend (raw URA) formats
export async function getTransactions() {
  const allTransactions = [];

  try {
    const res = await fetch(`${API_URL}/api/transactions?batch=1`);
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const data = await res.json();

    // Old backend format: { success: true, count: N, data: [...flat transactions] }
    if (data.success && Array.isArray(data.data)) {
      console.log(`Loaded ${data.count} transactions (flattened format)`);
      data.data.forEach(tx => {
        const norm = normalizeTransaction(tx);
        if (norm.year > 0 && norm.psf > 0) {
          allTransactions.push(norm);
        }
      });
      return allTransactions;
    }

    // New backend format: { Result: [{ project, transaction: [...] }] }
    if (data.Result && Array.isArray(data.Result)) {
      console.log(`Batch 1: ${data.Result.length} projects (raw URA format)`);
      data.Result.forEach(project => {
        if (project.transaction && Array.isArray(project.transaction)) {
          project.transaction.forEach(tx => {
            const merged = { ...tx, project: project.project, street: project.street, marketSegment: project.marketSegment };
            const norm = normalizeTransaction(merged);
            if (norm.year > 0 && norm.psf > 0) allTransactions.push(norm);
          });
        }
      });

      // Fetch remaining batches 2-4
      for (let batch = 2; batch <= 4; batch++) {
        try {
          const batchRes = await fetch(`${API_URL}/api/transactions?batch=${batch}`);
          if (!batchRes.ok) { if (batchRes.status === 404) break; continue; }
          const batchData = await batchRes.json();
          if (batchData.Result) {
            batchData.Result.forEach(project => {
              if (project.transaction) {
                project.transaction.forEach(tx => {
                  const merged = { ...tx, project: project.project, street: project.street, marketSegment: project.marketSegment };
                  const norm = normalizeTransaction(merged);
                  if (norm.year > 0 && norm.psf > 0) allTransactions.push(norm);
                });
              }
            });
          }
          console.log(`Batch ${batch}: loaded`);
        } catch (err) {
          console.warn(`Batch ${batch} error:`, err.message);
        }
      }
      return allTransactions;
    }

    throw new Error('Unexpected API response format');
  } catch (err) {
    console.error('Failed to load transactions:', err);
    throw err;
  }
}

// Fetch rental data
export async function getRentals() {
  const allRentals = [];
  
  // Generate refPeriods for last 5 years of quarters
  const now = new Date();
  const refPeriods = [];
  for (let y = now.getFullYear() - 5; y <= now.getFullYear(); y++) {
    for (let q = 1; q <= 4; q++) {
      const yy = String(y).slice(2);
      refPeriods.push(`${yy}q${q}`);
    }
  }

  for (const refPeriod of refPeriods) {
    try {
      const res = await fetch(`${API_URL}/api/rentals?refPeriod=${refPeriod}`);
      if (!res.ok) continue;
      const data = await res.json();

      // Handle both formats
      const results = data.Result || (data.success ? data.data : null);
      if (!results || !Array.isArray(results)) continue;

      if (results.length > 0 && results[0].rental) {
        // Raw URA format with nested rentals
        results.forEach(project => {
          if (project.rental) {
            project.rental.forEach(r => {
              allRentals.push({
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

      console.log(`Rentals ${refPeriod}: loaded`);
    } catch (err) {
      console.warn(`Rentals ${refPeriod} error:`, err.message);
    }
  }

  return allRentals;
}
