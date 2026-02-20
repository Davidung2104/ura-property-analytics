import { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import { T } from '../../constants';
import { Card, SectionHeader } from '../ui';

export default function RecordsTab({ projInfo, projData }) {
  const p = projInfo;
  const [sizeFilter, setSizeFilter] = useState('');
  const [rentBedFilter, setRentBedFilter] = useState('');
  const [rentAreaFilter, setRentAreaFilter] = useState('');

  // Derive unique sizes for dropdown
  const sizeOptions = useMemo(() => {
    const sizes = (projData?.sizeOptions || []);
    if (sizes.length <= 5) return sizes.map(s => ({ label: `${s.toLocaleString()} sf`, value: String(s), min: s - 25, max: s + 25 }));
    // Group into brackets for projects with many sizes
    const brackets = [];
    const step = 200;
    const minS = Math.floor(Math.min(...sizes) / step) * step;
    const maxS = Math.ceil(Math.max(...sizes) / step) * step;
    for (let lo = minS; lo < maxS; lo += step) {
      const hi = lo + step;
      const count = sizes.filter(s => s >= lo && s < hi).length;
      if (count > 0) brackets.push({ label: `${lo.toLocaleString()}-${hi.toLocaleString()} sf`, value: `${lo}-${hi}`, min: lo, max: hi });
    }
    return brackets;
  }, [projData?.sizeOptions]);

  const filteredTx = useMemo(() => {
    const all = projData?.projTx || [];
    if (!sizeFilter) return all;
    const opt = sizeOptions.find(o => o.value === sizeFilter);
    if (!opt) return all;
    return all.filter(tx => tx.area >= opt.min && tx.area < opt.max);
  }, [projData?.projTx, sizeFilter, sizeOptions]);

  const filteredRentTx = useMemo(() => {
    let all = projData?.projRentTx || [];
    if (rentBedFilter) all = all.filter(tx => tx.bedrooms === rentBedFilter);
    if (rentAreaFilter) {
      const [lo, hi] = rentAreaFilter.split('-').map(Number);
      all = all.filter(tx => tx.areaSqf >= lo && tx.areaSqf < hi);
    }
    return all;
  }, [projData?.projRentTx, rentBedFilter, rentAreaFilter]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionHeader icon="📋" title="Sale Transactions" sub={`${filteredTx.length} of ${(projData?.projTx || []).length} sales for ${p.name}.`} />
      <Card>
        {sizeOptions.length > 1 && <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: T.textSub, fontSize: T.md }}>Filter by size:</span>
          <select value={sizeFilter} onChange={e => setSizeFilter(e.target.value)} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: T.r, padding: '6px 10px', color: T.text, fontSize: T.base, cursor: 'pointer', outline: 'none', fontFamily: T.mono }}>
            <option value="">All Sizes</option>
            {sizeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {sizeFilter && <button onClick={() => setSizeFilter('')} style={{ background: 'none', border: 'none', color: T.textMute, cursor: 'pointer', fontSize: T.md }}>✕ Clear</button>}
        </div>}
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr>{['Date', 'Floor', 'Beds', 'Area (sf)', 'Price', 'PSF', 'Type'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{filteredTx.map((tx, i) => <tr key={i}>
              <td style={{ color: T.textMute }}>{tx.date}</td>
              <td style={{ color: T.text, fontFamily: T.mono }}>{tx.address}</td>
              <td style={{ color: T.purple, fontFamily: T.mono, fontWeight: 600 }}>{tx.beds ? `${tx.beds}BR` : '-'}</td>
              <td style={{ fontFamily: T.mono }}>{tx.area.toLocaleString()}</td>
              <td style={{ color: T.blue, fontFamily: T.mono }}>${tx.price.toLocaleString()}</td>
              <td style={{ color: tx.psf >= p.avgPsf * 1.1 ? T.green : tx.psf >= p.avgPsf * 0.95 ? T.amber : T.orange, fontFamily: T.mono }}>${tx.psf.toLocaleString()}</td>
              <td style={{ color: T.textMute }}>{tx.type}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </Card>

      <SectionHeader icon="🏠" title="Rental Contracts" sub={p.hasRealRental ? `${filteredRentTx.length} of ${(projData?.projRentTx || []).length} URA rental records. Aggregated by quarter.` : 'No URA rental data available for this project.'} />
      <Card>
        {!p.hasRealRental && <div style={{ textAlign: 'center', color: T.textMute, padding: 32 }}>No rental records from URA for this project yet.</div>}
        {p.hasRealRental && <>
        {(projData?.projRentTx || []).length > 0 && <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: T.textSub, fontSize: T.md }}>Filter:</span>
          {(projData?.rentalBedrooms || []).length > 0 && <select value={rentBedFilter} onChange={e => setRentBedFilter(e.target.value)} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: T.r, padding: '6px 10px', color: T.text, fontSize: T.base, cursor: 'pointer', outline: 'none', fontFamily: T.mono }}>
            <option value="">All Bedrooms</option>
            {(projData?.rentalBedrooms || []).map(b => <option key={b} value={b}>{b} Bed</option>)}
          </select>}
          <select value={rentAreaFilter} onChange={e => setRentAreaFilter(e.target.value)} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: T.r, padding: '6px 10px', color: T.text, fontSize: T.base, cursor: 'pointer', outline: 'none', fontFamily: T.mono }}>
            <option value="">All Sizes</option>
            <option value="0-500">Under 500 sf</option>
            <option value="500-1000">500 – 1,000 sf</option>
            <option value="1000-1500">1,000 – 1,500 sf</option>
            <option value="1500-2000">1,500 – 2,000 sf</option>
            <option value="2000-3000">2,000 – 3,000 sf</option>
            <option value="3000-99999">3,000+ sf</option>
          </select>
          {(rentBedFilter || rentAreaFilter) && <button onClick={() => { setRentBedFilter(''); setRentAreaFilter(''); }} style={{ background: 'none', border: 'none', color: T.textMute, cursor: 'pointer', fontSize: T.md }}>✕ Clear</button>}
        </div>}
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr>{['Period', 'Area (sf)', 'Beds', 'Rent/mo', 'Rent PSF', 'Lease Date', 'Contracts'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{filteredRentTx.map((tx, i) => <tr key={i}>
              <td style={{ color: T.textMute }}>{tx.date}</td>
              <td style={{ fontFamily: T.mono, whiteSpace: 'nowrap' }}>{tx.area || '—'}</td>
              <td style={{ fontFamily: T.mono, color: T.textSub, textAlign: 'center' }}>{tx.bedrooms || '—'}</td>
              <td style={{ color: T.teal, fontFamily: T.mono }}>${tx.rent.toLocaleString()}</td>
              <td style={{ color: tx.psf >= (p.rentPsf || 4) * 1.2 ? T.green : tx.psf >= (p.rentPsf || 4) * 0.8 ? T.amber : T.orange, fontFamily: T.mono }}>${tx.psf.toFixed(2)}</td>
              <td style={{ color: T.textMute, fontSize: T.sm }}>{tx.leaseDate || '—'}</td>
              <td style={{ fontFamily: T.mono, color: T.textSub }}>{tx.contracts || '—'}</td>
            </tr>)}</tbody>
          </table>
        </div>
        </>}
      </Card>
    </div>
  );
}

RecordsTab.propTypes = {
  projInfo: PropTypes.shape({
    name: PropTypes.string.isRequired,
    avgPsf: PropTypes.number.isRequired,
    rentPsf: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }).isRequired,
  projData: PropTypes.shape({
    projTx: PropTypes.array,
    projRentTx: PropTypes.array,
    sizeOptions: PropTypes.array,
    rentalBedrooms: PropTypes.array,
  }),
};
