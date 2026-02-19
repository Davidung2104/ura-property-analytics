import PropTypes from 'prop-types';
import { T } from '../../constants';

const isPct = (name) => /(%|YoY|QoQ|Premium|Yield|CAGR|Growth)/i.test(name || '');
const isCount = (name) => /^(Tx |Count|Contract|Transaction)/i.test(name || '');
const isUnit = (name) => /^(Area|Floor|Size)/i.test(name || '');

export default function Tip({ active, payload, label, fmt, unit, pre }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: `${T.text}f0`, padding: '10px 14px', borderRadius: T.r, border: `1px solid ${T.textFaint}`, boxShadow: '0 4px 20px rgba(0,0,0,0.06)', fontFamily: T.sans }}>
      <p style={{ color: T.textMute, fontSize: T.md, marginBottom: 6 }}>{label}</p>
      {payload.map((p, i) => {
        const pct = fmt === '%' || isPct(p.name);
        const plain = fmt === 'none' || isCount(p.name) || isUnit(p.name);
        const prefix = pre || (pct || plain ? '' : '$');
        const suffix = pct ? '%' : (unit || '');
        return (
          <p key={i} style={{ color: p.color || '#fff', fontSize: T.base, margin: '2px 0' }}>
            {p.name}: {prefix}{typeof p.value === 'number' ? p.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : p.value}{suffix}
          </p>
        );
      })}
    </div>
  );
}

Tip.propTypes = {
  active: PropTypes.bool,
  payload: PropTypes.array,
  label: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  fmt: PropTypes.oneOf(['%', 'none', undefined]),
  unit: PropTypes.string,
  pre: PropTypes.string,
};
