import PropTypes from 'prop-types';
import { T } from '../../constants';

export function Card({ children, style }) {
  return <div style={{ background: T.card, borderRadius: T.rXl, padding: 20, border: `1px solid ${T.border}`, ...style }}>{children}</div>;
}
Card.propTypes = { children: PropTypes.node.isRequired, style: PropTypes.object };

export function StatCard({ label, value, color, icon, sub }) {
  return (
    <div style={{ background: '#fff', borderRadius: T.rLg, padding: '14px 16px', border: `1px solid ${T.border}`, overflow: 'hidden' }}>
      <div style={{ marginBottom: 6 }}>
        <span style={{ color: T.textMute, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{label}</span>
      </div>
      <div style={{ color: T.text, fontSize: 17, fontWeight: 700, fontFamily: T.mono, letterSpacing: '-0.02em', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ color: T.textMute, fontSize: 10, marginTop: 4, fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
    </div>
  );
}
StatCard.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired, sub: PropTypes.string };

export function SectionHeader({ title, sub }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h3 style={{ color: T.text, fontSize: T['2xl'], fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
        {title}
      </h3>
      {sub && <p style={{ color: T.textSub, fontSize: T.base, margin: 0, lineHeight: 1.5, fontWeight: 400 }}>{sub}</p>}
    </div>
  );
}
SectionHeader.propTypes = { title: PropTypes.string.isRequired, sub: PropTypes.string };

export function InsightBar({ items }) {
  return (
    <div style={{ background: `linear-gradient(90deg,${T.blue}10,${T.purple}10)`, borderRadius: T.rLg, padding: '12px 18px', border: `1px solid ${T.borderLt}`, marginBottom: 8, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ color: T.amber, fontSize: T.lg }}>💡</span>
      {items.map((it, i) => (
        <span key={i} style={{ color: T.textMute, fontSize: T.base, lineHeight: 1.5 }}>
          {i > 0 && <span style={{ color: T.textFaint, margin: '0 4px' }}>·</span>}
          {it}
        </span>
      ))}
    </div>
  );
}
InsightBar.propTypes = { items: PropTypes.array.isRequired };

export function NoteText({ children, style }) {
  return <p style={{ color: T.textSub, fontSize: T.md, lineHeight: 1.6, margin: '0 0 12px', fontStyle: 'italic', ...style }}>{children}</p>;
}
NoteText.propTypes = { children: PropTypes.node.isRequired, style: PropTypes.object };

export function Divider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0 8px' }}>
      <div style={{ flex: 1, height: 1, background: T.border }} />
      <span style={{ color: T.textSub, fontSize: T.sm, textTransform: 'uppercase', letterSpacing: 1.2, whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: T.border }} />
    </div>
  );
}
Divider.propTypes = { label: PropTypes.string.isRequired };
