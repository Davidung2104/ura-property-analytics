import PropTypes from 'prop-types';
import { T } from '../../constants';
import { Card, SectionHeader } from '../ui';

export default function RecordsTab({ projInfo, projData }) {
  const p = projInfo;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionHeader icon="📋" title="Recent Sale Transactions" sub={`${projData?.projTx?.length || 0} most recent sales for ${p.name}. Higher floors and smaller units typically command premium PSF.`} />
      <Card>
        <table>
          <thead><tr>{['Date', 'Unit', 'Area (sf)', 'Price', 'PSF', 'Type'].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{(projData?.projTx || []).map((tx, i) => <tr key={i}>
            <td style={{ color: T.textMute }}>{tx.date}</td>
            <td style={{ color: T.text, fontFamily: T.mono }}>{tx.address}</td>
            <td style={{ fontFamily: T.mono }}>{tx.area.toLocaleString()}</td>
            <td style={{ color: T.blue, fontFamily: T.mono }}>${tx.price.toLocaleString()}</td>
            <td style={{ color: tx.psf >= p.avgPsf * 1.1 ? T.green : tx.psf >= p.avgPsf * 0.95 ? T.amber : T.orange, fontFamily: T.mono }}>${tx.psf.toLocaleString()}</td>
            <td style={{ color: T.textMute }}>{tx.type}</td>
          </tr>)}</tbody>
        </table>
      </Card>

      <SectionHeader icon="🏠" title="Recent Rental Contracts" sub="Rent PSF varies by unit size — smaller units are more rent-efficient per sqft." />
      <Card>
        <table>
          <thead><tr>{['Date', 'Unit', 'Area (sf)', 'Rent/mo', 'Rent PSF'].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{(projData?.projRentTx || []).map((tx, i) => <tr key={i}>
            <td style={{ color: T.textMute }}>{tx.date}</td>
            <td style={{ color: T.text, fontFamily: T.mono }}>{tx.address}</td>
            <td style={{ fontFamily: T.mono }}>{tx.area.toLocaleString()}</td>
            <td style={{ color: T.teal, fontFamily: T.mono }}>${tx.rent.toLocaleString()}</td>
            <td style={{ color: tx.psf >= (p.rentPsf || 4) * 1.2 ? T.green : tx.psf >= (p.rentPsf || 4) * 0.8 ? T.amber : T.orange, fontFamily: T.mono }}>${tx.psf.toFixed(2)}</td>
          </tr>)}</tbody>
        </table>
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
  }),
};
