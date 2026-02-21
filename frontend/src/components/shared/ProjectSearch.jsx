import { useState, useMemo, useEffect, useRef } from 'react';
import { T } from '../../constants';

export default function ProjectSearch({ value, projList, cmpPool, projIndex, onChange, hero, compact }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return projList.slice(0, 20);
    const q = query.toLowerCase();
    return projList.filter(n => n.toLowerCase().includes(q)).slice(0, 20);
  }, [query, projList]);

  const handleSelect = (name) => { onChange(name); setQuery(''); setOpen(false); };

  const cp = (name) => {
    const idx = projIndex?.[name];
    if (idx) return { psf: idx.psf, dist: idx.dist, segment: idx.seg, units: idx.n, yield: idx.yield };
    const pool = cmpPool.find(p => p.name === name);
    return pool ? { psf: pool.psf, dist: pool.dist, segment: pool.segment, units: pool.units, yield: pool.yield } : null;
  };

  const segClr = (s) => s === 'CCR' ? '#dc2626' : s === 'RCR' ? '#d97706' : '#059669';

  if (hero) return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }} role="combobox" aria-expanded={open} aria-haspopup="listbox" aria-label="Search projects">
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <svg style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 18, height: 18, color: '#9ca3af' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input value={query} onFocus={() => setOpen(true)} onChange={e => { setQuery(e.target.value); setOpen(true); }}
            placeholder="Search condo projects e.g. Riviere, Marina One..."
            aria-label="Search condo projects" aria-autocomplete="list" role="searchbox"
            style={{ width: '100%', background: '#fff', border: `1.5px solid ${open ? '#2563eb' : '#d1d5db'}`, borderRadius: 10, padding: '13px 16px 13px 42px', color: T.text, fontSize: 14, outline: 'none', fontFamily: T.sans, transition: 'border-color 0.2s', boxShadow: open ? '0 0 0 3px rgba(37,99,235,0.08)' : '0 1px 2px rgba(0,0,0,0.04)' }} />
        </div>
        <button aria-label="Search" style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, padding: '13px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 1px 3px rgba(37,99,235,0.3)' }}>Search</button>
      </div>
      {open && filtered.length > 0 && <SearchResults filtered={filtered} cp={cp} segClr={segClr} value={value} onSelect={handleSelect} query={query} />}
    </div>
  );

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1, maxWidth: compact ? 320 : 480 }} role="combobox" aria-expanded={open} aria-haspopup="listbox" aria-label="Search projects">
      <div style={{ position: 'relative' }}>
        <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#9ca3af' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input value={open ? query : value} onFocus={() => { setOpen(true); setQuery(''); }} onChange={e => { setQuery(e.target.value); setOpen(true); }}
          placeholder="Search project..."
          aria-label="Search project" aria-autocomplete="list" role="searchbox"
          style={{ width: '100%', background: '#f8f9fb', border: `1px solid ${open ? '#2563eb' : '#e5e5ee'}`, borderRadius: 6, padding: '7px 10px 7px 30px', color: T.text, fontSize: 12, outline: 'none', fontFamily: T.sans, transition: 'border-color 0.2s' }} />
      </div>
      {open && filtered.length > 0 && <SearchResults filtered={filtered} cp={cp} segClr={segClr} value={value} onSelect={handleSelect} query={query} />}
    </div>
  );
}

function SearchResults({ filtered, cp, segClr, value, onSelect, query }) {
  return (
    <ul role="listbox" aria-label="Search results" style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: '1px solid #e5e5ee', borderRadius: 8, boxShadow: '0 10px 40px rgba(0,0,0,0.1)', maxHeight: 360, overflowY: 'auto', zIndex: 100, listStyle: 'none', padding: 0 }}>
      {filtered.map((name) => {
        const p = cp(name);
        return <li key={name} role="option" aria-selected={name === value} onClick={() => onSelect(name)} tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && onSelect(name)}
          style={{ padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #f8f9fb', transition: 'background 0.1s' }}
          onMouseEnter={e => e.currentTarget.style.background = '#f8f9fb'}
          onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: 12, color: name === value ? '#2563eb' : T.text }}>{name}</span>
              {p && <span style={{ color: T.textMute, fontSize: 10, marginLeft: 8 }}>{p.dist}</span>}
            </div>
            {p && <span style={{ color: T.text, fontFamily: T.mono, fontSize: 11, fontWeight: 600 }}>${p.psf?.toLocaleString()} PSF</span>}
          </div>
          {p && <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
            <span style={{ color: segClr(p.segment), fontSize: 9, fontWeight: 600, background: `${segClr(p.segment)}10`, padding: '1px 5px', borderRadius: 3 }}>{p.segment}</span>
            <span style={{ color: T.textMute, fontSize: 9 }}>{p.units} tx{p.yield ? ` · ${p.yield}% yield` : ''}</span>
          </div>}
        </li>;
      })}
      {filtered.length === 20 && query.trim() && <li style={{ padding: '8px 14px', color: T.textMute, fontSize: 10, textAlign: 'center', borderTop: '1px solid #f5f6f8' }}>Type more to narrow results...</li>}
    </ul>
  );
}
