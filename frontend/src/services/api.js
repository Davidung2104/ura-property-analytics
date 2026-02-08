const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const SQM_TO_SQFT = 10.764;

// Normalize a single URA transaction from nested API format to flat format
function flattenTransaction(project, tx) {
  const areaSqm = parseFloat(tx.area) || 0;
  const price = parseFloat(tx.price) || 0;
  const psm = areaSqm > 0 ? price / areaSqm : 0;
  const psf = psm / SQM_TO_SQFT;
  
  // Parse contractDate: URA format is "MMYY" e.g. "0715" = July 2015
  let contractDate = tx.contractDate || '';
  let year = 0;
  let month = '';
  if (contractDate.length === 4) {
    const mm = contractDate.substring(0, 2);
    const yy = contractDate.substring(2, 4);
    const fullYear = parseInt(yy) > 50 ? 1900 + parseInt(yy) : 2000 + parseInt(yy);
    year = fullYear;
    month = `${fullYear}-${mm}`;
    contractDate = month;
  }

  // Normalize tenure
  const rawTenure = tx.tenure || '';
  let tenure = rawTenure;
  if (rawTenure.toLowerCase() === 'freehold' || rawTenure === 'FH') {
    tenure = 'FH';
  } else if (rawTenure.includes('yrs')) {
    // Extract lease years: "99 yrs lease commencing from 2007" → "99 yrs"
    const match = rawTenure.match(/(\d+)\s*yrs/);
    tenure = match ? `${match[1]} yrs` : rawTenure;
  }

  return {
    project: project.project || '',
    street: project.street || '',
    district: tx.district || '',
    floorRange: tx.floorRange || '',
    areaNum: areaSqm,
    areaSqft: Math.round(areaSqm * SQM_TO_SQFT * 100) / 100,
    priceNum: price,
    psm: Math.round(psm * 100) / 100,
    psf: Math.round(psf * 100) / 100,
    contractDate,
    year,
    marketSegment: project.marketSegment || '',
    propertyType: tx.propertyType || '',
    tenure,
    tenureRaw: rawTenure,
    typeOfSale: tx.typeOfSale || '',
    typeOfArea: tx.typeOfArea || '',
    noOfUnits: parseInt(tx.noOfUnits) || 1,
  };
}

// Fetch all batches from the URA API via our backend proxy
export async function getTransactions() {
  const allTransactions = [];

  // URA API has up to 4 batches
  for (let batch = 1; batch <= 4; batch++) {
    try {
      const res = await fetch(`${API_URL}/api/transactions?batch=${batch}`);
      if (!res.ok) {
        if (res.status === 404) break; // No more batches
        throw new Error(`Batch ${batch} failed: ${res.status}`);
      }
      const data = await res.json();
      
      if (data.Result && Array.isArray(data.Result)) {
        data.Result.forEach(project => {
          if (project.transaction && Array.isArray(project.transaction)) {
            project.transaction.forEach(tx => {
              const flat = flattenTransaction(project, tx);
              if (flat.year > 0 && flat.psf > 0) {
                allTransactions.push(flat);
              }
            });
          }
        });
      }
    } catch (err) {
      console.warn(`Batch ${batch} error:`, err.message);
      if (batch === 1) throw err; // First batch must succeed
    }
  }

  return allTransactions;
}
