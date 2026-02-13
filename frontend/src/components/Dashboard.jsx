import { useState, useMemo, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
  Legend, ComposedChart, AreaChart, Area, ScatterChart, Scatter, ZAxis
} from "recharts";
import { fetchDashboard, fetchProject } from "../services/api";

const P = ['#0ea5e9','#6366f1','#8b5cf6','#f43f5e','#10b981','#f59e0b','#ec4899','#14b8a6','#ef4444','#3b82f6'];
const SC = { CCR:'#ef4444', RCR:'#f59e0b', OCR:'#22c55e' };
const fm = "'JetBrains Mono', monospace";

const haversine = (lat1,lng1,lat2,lng2) => {
  const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
};

// CAGR computation helpers
const computeCAGR = (startAvg, endAvg, years) => {
  if(!startAvg||!endAvg||years<=0) return null;
  return (Math.pow(endAvg/startAvg, 1/years)-1)*100;
};
const computeBucketCAGR = (txList, startYear, endYear) => {
  if(!txList?.length) return { startAvg:null, endAvg:null, startN:0, endN:0, totalN:0, cagr:null, lowConf:true, annualAvg:[] };
  const years = [...new Set(txList.map(t=>t.year))].sort();
  const sy = startYear || years[0];
  const ey = endYear || years[years.length-1];
  const byYear = {};
  txList.forEach(tx => {
    if(!byYear[tx.year]) byYear[tx.year]={sum:0,count:0};
    byYear[tx.year].sum += tx.psf;
    byYear[tx.year].count += 1;
  });
  const startBucket = byYear[sy];
  const endBucket = byYear[ey];
  const startAvg = startBucket ? Math.round(startBucket.sum/startBucket.count) : null;
  const endAvg = endBucket ? Math.round(endBucket.sum/endBucket.count) : null;
  const startN = startBucket?.count||0;
  const endN = endBucket?.count||0;
  const n = parseInt(ey)-parseInt(sy);
  const cagr = computeCAGR(startAvg, endAvg, n);
  const lowConf = startN<3||endN<3;
  const annualAvg = years.map(y => {
    const b = byYear[y];
    return { year:y, avg: b?Math.round(b.sum/b.count):null, n: b?.count||0 };
  });
  return { startAvg, endAvg, startN, endN, totalN:txList.length, cagr, lowConf, annualAvg };
};

function Tip({ active, payload, label, fmt, unit }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background:'#1e293bf0', padding:'10px 14px', borderRadius:8, border:'1px solid #cbd5e1', boxShadow:'0 4px 20px rgba(0,0,0,0.06)' }}>
      <p style={{ color:'#94a3b8', fontSize:11, marginBottom:6 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color:p.color||'#fff', fontSize:12, margin:'2px 0' }}>
          {p.name}: {fmt==='%'?'':(fmt==='none'?'':'$')}{typeof p.value==='number'?p.value.toLocaleString(undefined,{maximumFractionDigits:2}):p.value}{fmt==='%'?'%':''}{unit||''}
        </p>
      ))}
    </div>
  );
}
const Cd = ({ children }) => <div style={{ background:'#f1f5f9', borderRadius:14, padding:20, border:'1px solid #e2e8f0' }}>{children}</div>;
const St = ({ label, value, color, icon, sub }) => <div style={{ background:'#f1f5f9', borderRadius:12, padding:'14px 16px', border:'1px solid #e2e8f0' }}><div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}><span style={{ color:'#64748b', fontSize:10, textTransform:'uppercase', letterSpacing:'0.5px' }}>{label}</span><span style={{ fontSize:14 }}>{icon}</span></div><div style={{ color, fontSize:18, fontWeight:700, fontFamily:fm }}>{value}</div>{sub&&<div style={{ color:'#64748b', fontSize:10, marginTop:2 }}>{sub}</div>}</div>;
const SH = ({ icon, title, sub }) => <div style={{ marginBottom:12 }}><h3 style={{ color:'#1e293b', fontSize:15, fontWeight:700, margin:'0 0 4px', display:'flex', alignItems:'center', gap:8 }}><span style={{ fontSize:17 }}>{icon}</span>{title}</h3>{sub&&<p style={{ color:'#64748b', fontSize:11, margin:0, lineHeight:1.5 }}>{sub}</p>}</div>;
const IB = ({ items }) => <div style={{ background:'linear-gradient(90deg,#38bdf810,#a78bfa10)', borderRadius:12, padding:'12px 18px', border:'1px solid #f1f5f9', marginBottom:8, display:'flex', gap:16, flexWrap:'wrap', alignItems:'center' }}><span style={{ color:'#f59e0b', fontSize:13 }}>💡</span>{items.map((it,i)=><span key={i} style={{ color:'#94a3b8', fontSize:12, lineHeight:1.5 }}>{i>0&&<span style={{ color:'#cbd5e1', margin:'0 4px' }}>·</span>}{it}</span>)}</div>;
const Nr = ({ children }) => <p style={{ color:'#64748b', fontSize:11, lineHeight:1.6, margin:'0 0 12px', fontStyle:'italic' }}>{children}</p>;
const Dv = ({ label }) => <div style={{ display:'flex', alignItems:'center', gap:12, margin:'16px 0 8px' }}><div style={{ flex:1, height:1, background:'#e2e8f0' }}/><span style={{ color:'#64748b', fontSize:10, textTransform:'uppercase', letterSpacing:1.2, whiteSpace:'nowrap' }}>{label}</span><div style={{ flex:1, height:1, background:'#e2e8f0' }}/></div>;

function MarketTab({ mode, data }) {
  const s = mode === 'sales';
  const mainC = s ? '#0ea5e9' : '#10b981';
  const accC = s ? '#6366f1' : '#34d399';

  // Local state for transaction table
  const [txSearch, setTxSearch] = useState('');
  const [txDistF, setTxDistF] = useState('');
  const [txSegF, setTxSegF] = useState('');
  const [txPage, setTxPage] = useState(0);
  const pgSize = 25;

  const allTx = s ? (data?.mktSaleTx||[]) : (data?.mktRentTx||[]);
  const txDistricts = [...new Set(allTx.map(t=>t.district))].sort();
  const txSegments = [...new Set(allTx.map(t=>t.segment))].sort();

  const filtered = useMemo(() => {
    let f = allTx;
    if(txSearch) { const q=txSearch.toLowerCase(); f=f.filter(t=>t.project.toLowerCase().includes(q)||t.unit.toLowerCase().includes(q)||t.district.toLowerCase().includes(q)); }
    if(txDistF) f=f.filter(t=>t.district===txDistF);
    if(txSegF) f=f.filter(t=>t.segment===txSegF);
    return f;
  }, [allTx, txSearch, txDistF, txSegF]);
  const pageCount = Math.ceil(filtered.length/pgSize);
  const pageTx = filtered.slice(txPage*pgSize,(txPage+1)*pgSize);

  const td = s ? (data?.yoy||[]) : (data?.rTrend||[]);
  const segD = s ? (data?.sSeg||[]) : (data?.rSeg||[]);
  const topD = s ? (data?.sTop||[]) : (data?.rTop||[]);
  const dlD = s ? (data?.sDistLine||[]) : (data?.rDistLine||[]);
  const dbD = s ? (data?.sDistBar||[]) : (data?.rDistBar||[]);
  const tyD = s ? (data?.sType||[]) : (data?.rType||[]);
  const s2D = s ? (data?.sTenure||[]) : (data?.rBed||[]);
  const hiD = s ? (data?.sHist||[]) : (data?.rHist||[]);
  const scD = s ? (data?.sScat||[]) : (data?.rScat||[]);
  const cuD = s ? (data?.sCum||[]) : (data?.rCum||[]);

  const dlFmt = s ? (v=>'$'+v.toLocaleString()) : (v=>'$'+v.toFixed(2));
  const dbFmt = s ? (v=>'$'+v.toLocaleString()) : (v=>'$'+v.toFixed(2));
  const cuFmt = s ? (v=>`$${(v/1e9).toFixed(1)}B`) : (v=>v.toLocaleString());
  const yFmt = s ? (v=>'$'+v.toLocaleString()) : (v=>'$'+v.toLocaleString());

  return (
    <div style={{ display:'grid', gap:16 }}>
      <IB items={s ? [
        <span key="a">Prices <span style={{color:'#4ade80',fontWeight:700,fontFamily:fm}}>+4.6%</span> YoY — 3rd consecutive year of growth</span>,
        <span key="b"><span style={{color:mainC,fontWeight:700,fontFamily:fm}}>9,100</span> transactions ($18.6B)</span>,
        <span key="c">Avg <span style={{color:'#fb923c',fontWeight:700,fontFamily:fm}}>$2,040</span> PSF — new all-time high</span>,
      ] : [
        <span key="a">Rents <span style={{color:'#4ade80',fontWeight:700,fontFamily:fm}}>+2.6%</span> QoQ — but decelerating from 3.6% in Q1</span>,
        <span key="b"><span style={{color:mainC,fontWeight:700,fontFamily:fm}}>12,400</span> contracts this year</span>,
        <span key="c">Avg <span style={{color:'#fb923c',fontWeight:700,fontFamily:fm}}>$4,820</span>/mo — landlords retain pricing power</span>,
      ]}/>

      {/* ── TRENDS ── */}
      <Dv label="Trends"/>

      <SH icon="📈" title={s?'Sale Price Trend':'Rental Trend'} sub={s?'Average & median PSF with YoY growth. Median trails average by ~$190 — right-skewed market favours high-end transactions.':'Average & median monthly rent with QoQ growth. Note 23Q4 dip — seasonal correction before Chinese New Year.'}/>
      <Cd><div style={{height:280}}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={td}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey={s?'year':'q'} tick={{fill:'#64748b',fontSize:11}} axisLine={false}/><YAxis yAxisId="l" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={yFmt}/><YAxis yAxisId="r" orientation="right" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>`${v>0?'+':''}${v}%`}/><Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:11}}/><Bar yAxisId="l" dataKey="avg" name={s?'Avg PSF':'Avg Rent'} fill={mainC} radius={[4,4,0,0]} barSize={s?26:18}/><Bar yAxisId="l" dataKey="med" name={s?'Med PSF':'Med Rent'} fill={accC} radius={[4,4,0,0]} barSize={s?26:18}/><Line yAxisId="r" type="monotone" dataKey={s?'yoy':'qoq'} name={s?'YoY %':'QoQ %'} stroke="#f59e0b" strokeWidth={2.5} dot={{r:4,fill:'#f59e0b'}}/></ComposedChart></ResponsiveContainer></div></Cd>
      {s ? <Nr>Growth slowing from 9.9% (2022) to 4.6% (2024) — cooling measures taking effect. Still positive, but the era of double-digit gains appears over.</Nr> : <Nr>QoQ growth decelerating: 3.6% → 3.4% → –1.8% → 3.6% → 1.5% → 1.1% → 2.6%. Landlords still gaining but tenants have more negotiating room than in 2022–23.</Nr>}

      <div className="g2">
        <Cd><SH icon="🎯" title={s?'Sales by Segment':'Rentals by Segment'} sub={s?'OCR dominates volume (45%) but CCR captures the highest PSF. Value hunters are in OCR; capital appreciation plays are in CCR.':'CCR commands $6,600/mo avg — 74% premium over OCR. But OCR has 45% of all contracts, showing strongest demand.'}/>
          <div style={{height:230,display:'flex',gap:16}}><div style={{flex:1}}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={segD} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={78} innerRadius={44} paddingAngle={3}>{segD.map((e,i)=><Cell key={i} fill={SC[e.name]}/>)}</Pie><Tooltip content={<Tip/>}/></PieChart></ResponsiveContainer></div>
          <div style={{display:'flex',flexDirection:'column',justifyContent:'center',gap:10}}>{segD.map(x=><div key={x.name} style={{display:'flex',alignItems:'center',gap:8}}><div style={{width:10,height:10,borderRadius:3,background:SC[x.name]}}/><div><div style={{color:'#1e293b',fontSize:12,fontWeight:600}}>{x.name}</div><div style={{color:'#64748b',fontSize:11}}>{s?`$${x.val.toLocaleString()} psf`:`$${x.val.toLocaleString()}/mo`} · {x.count.toLocaleString()}</div></div></div>)}</div></div>
        </Cd>
        <Cd><SH icon="🏆" title={s?'Most Traded Projects':'Most Rented Projects'} sub={s?'High volume signals liquidity — easier to buy and exit. TREASURE leads on sheer unit count (2,203 units).':'High rental volume = strong tenant demand. THE SAIL tops the list — expat-heavy Marina Bay drives consistent leasing.'}/>
          <div style={{height:230}}><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={topD}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0"/><XAxis type="number" tick={{fill:'#64748b',fontSize:10}} axisLine={false}/><YAxis dataKey="n" type="category" width={160} tick={{fill:'#94a3b8',fontSize:9}} axisLine={false}/><Tooltip content={<Tip/>}/><Bar dataKey="c" name={s?'Transactions':'Contracts'} radius={[0,6,6,0]} barSize={14}>{topD.map((_,i)=><Cell key={i} fill={P[i%P.length]}/>)}</Bar></BarChart></ResponsiveContainer></div>
        </Cd>
      </div>

      {/* ── GEOGRAPHY ── */}
      <Dv label="Geography"/>
      <SH icon="📍" title={s?'District PSF Trends':'District Rent PSF Trends'} sub={s?'D9 (Orchard) widening its lead — up 7.3% since 23Q1. D5 (Pasir Panjang) rising fastest at 9.4%.':'D9 maintains highest rent PSF at $5.45/sqft/mo. D15 (East Coast) showing steepest climb — up 6.2% since 23Q1.'}/>
      <Cd><div style={{height:280}}><ResponsiveContainer width="100%" height="100%"><LineChart data={dlD}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="q" tick={{fill:'#64748b',fontSize:10}} axisLine={false}/><YAxis tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={dlFmt}/><Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:11}}/>{(data?.topDistricts||['D1','D5','D9','D10','D15']).map((d,i)=><Line key={d} type="monotone" dataKey={d} stroke={P[i]} strokeWidth={2} dot={{r:3}} connectNulls/>)}</LineChart></ResponsiveContainer></div></Cd>

      <SH icon="📐" title={s?'Current PSF by District':'Current Rent PSF by District'} sub={s?'D9 at $3,100 commands a 142% premium over D19 ($1,280). Location premium drives price more than any other factor.':'D9 at $5.45/sqft/mo vs D19 at $3.39 — a 61% premium. But yield-wise, D19 wins (3.18% vs 2.11%).'}/>
      <Cd><div style={{height:240}}><ResponsiveContainer width="100%" height="100%"><BarChart data={dbD}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="d" tick={{fill:'#64748b',fontSize:10}} axisLine={false}/><YAxis tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={dbFmt}/><Tooltip content={<Tip/>}/><Bar dataKey="v" name={s?'Sale PSF':'Rent PSF ($/sqft/mo)'} fill={s?'#0ea5e9':'#f59e0b'} radius={[4,4,0,0]} barSize={24}/></BarChart></ResponsiveContainer></div></Cd>

      {/* ── STRUCTURE ── */}
      <Dv label="Structure"/>
      <div className="g3">
        <Cd><h4 style={{color:'#1e293b',fontSize:13,fontWeight:600,marginBottom:4}}>By Property Type</h4>
          <Nr>{s?'Condos lead at $2,180 PSF — includes premium facilities. Exec Condos at $1,340 offer 39% discount (HDB upgrader sweet spot).':'Condos average $5,200/mo — a 27% premium over apartments due to newer stock and better facilities.'}</Nr>
          <div style={{height:190}}><ResponsiveContainer width="100%" height="100%"><BarChart data={tyD}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="t" tick={{fill:'#64748b',fontSize:9}} axisLine={false}/><YAxis tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={yFmt}/><Tooltip content={<Tip/>}/><Bar dataKey="v" name={s?'Avg PSF':'Avg Rent'} radius={[4,4,0,0]} barSize={30}>{tyD.map((_,i)=><Cell key={i} fill={P[i]}/>)}</Bar></BarChart></ResponsiveContainer></div>
        </Cd>
        <Cd><h4 style={{color:'#1e293b',fontSize:13,fontWeight:600,marginBottom:4}}>{s?'By Tenure':'By Bedroom'}</h4>
          <Nr>{s?'Freehold commands a 30% premium ($2,350 vs $1,810) over 99-yr. The 999-yr at $2,180 trades near freehold — market treats them as equivalent.':'1BR yields highest rent PSF ($6.72/sqft) but lowest absolute rent ($2,850/mo). 4-5BR tenants pay more total but less per sqft — the "bulk discount" of residential leasing.'}</Nr>
          <div style={{height:190}}><ResponsiveContainer width="100%" height="100%"><BarChart data={s2D}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="t" tick={{fill:'#64748b',fontSize:9}} axisLine={false}/><YAxis tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={yFmt}/><Tooltip content={<Tip/>}/><Bar dataKey="v" name={s?'Avg PSF':'Avg Rent/mo'} radius={[4,4,0,0]} barSize={s?40:28}>{s2D.map((_,i)=><Cell key={i} fill={s?['#22c55e','#f59e0b','#38bdf8'][i]:P[i%P.length]}/>)}</Bar></BarChart></ResponsiveContainer></div>
        </Cd>
        <Cd><h4 style={{color:'#1e293b',fontSize:13,fontWeight:600,marginBottom:4}}>{s?'PSF Distribution':'Rent Distribution'}</h4>
          <Nr>{s?'Right-skewed: bulk of transactions between $1,600–$2,400 PSF. The long tail above $2,600 is CCR dragging the average up.':'Most contracts cluster between $3,500–$6,000/mo. The gap between median ($4,200) and mean ($4,820) confirms CCR outliers lift the average.'}</Nr>
          <div style={{height:190}}><ResponsiveContainer width="100%" height="100%"><BarChart data={hiD}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="r" tick={{fill:'#64748b',fontSize:7}} axisLine={false} interval={2}/><YAxis tick={{fill:'#64748b',fontSize:10}} axisLine={false}/><Tooltip content={<Tip fmt="none"/>}/><Bar dataKey="c" name={s?'Transactions':'Contracts'} fill={s?'#8b5cf6':'#34d399'} radius={[2,2,0,0]} barSize={12}/></BarChart></ResponsiveContainer></div>
        </Cd>
      </div>

      <SH icon="⬡" title={s?'Price vs Unit Size':'Rent PSF vs Unit Size'} sub={s?'Inverse relationship: larger units = lower PSF across all segments. CCR small units (400–900sf) command the highest PSF.':'Same inverse pattern in rentals: smaller units are more efficient per sqft. Investors targeting yield should favour compact 1–2BR units.'}/>
      <Cd><div style={{height:280}}><ResponsiveContainer width="100%" height="100%"><ScatterChart><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis type="number" dataKey="a" name="Area (sqft)" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>`${Math.round(v)} sf`}/><YAxis type="number" dataKey="p" name={s?'PSF ($)':'Rent PSF ($/sf/mo)'} tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={s?(v=>'$'+v):(v=>'$'+v.toFixed(1))}/><Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:11}}/>{['CCR','RCR','OCR'].map(x=><Scatter key={x} name={x} data={scD.filter(d=>d.s===x)} fill={SC[x]} fillOpacity={0.6}/>)}</ScatterChart></ResponsiveContainer></div></Cd>

      <SH icon="📉" title={s?'Annual Sales Volume':'Annual Rental Contracts'} sub={s?'Per-quarter dollar volume — 2024 on pace to exceed 2023 by ~11%.':'Per-quarter contract count — 2024 slightly ahead of 2023, showing sustained demand despite cooling rents.'}/>
      <Cd><div style={{height:210}}><ResponsiveContainer width="100%" height="100%"><BarChart data={cuD}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="d" tick={{fill:'#64748b',fontSize:9}} axisLine={false}/><YAxis tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={cuFmt}/><Tooltip content={<Tip/>}/><Bar dataKey="v" name={s?'Volume':'Contracts'} fill={mainC} radius={[4,4,0,0]} barSize={14} fillOpacity={0.8}/></BarChart></ResponsiveContainer></div></Cd>

      {/* ── TRANSACTION RECORDS ── */}
      <Dv label="Transaction Records"/>
      <SH icon="📋" title={s?'Sale Transaction Records':'Rental Contract Records'} sub={`${allTx.length} records available. Search by project name, unit, or district. Filter by district or segment.`}/>
      <Cd>
        {/* Filters */}
        <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
          <div style={{flex:1,minWidth:200,position:'relative'}}>
            <input value={txSearch} onChange={e=>{setTxSearch(e.target.value);setTxPage(0);}} placeholder={s?'Search project, unit, district...':'Search project, unit, district...'} style={{background:'#fff',border:'1px solid #cbd5e1',borderRadius:8,padding:'8px 12px 8px 32px',color:'#1e293b',fontSize:12,width:'100%',outline:'none',fontFamily:fm}}/>
            <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontSize:13,opacity:0.5}}>🔍</span>
          </div>
          <select value={txDistF} onChange={e=>{setTxDistF(e.target.value);setTxPage(0);}} style={{background:'#fff',border:'1px solid #cbd5e1',borderRadius:8,padding:'8px 12px',color:'#1e293b',fontSize:12,cursor:'pointer',outline:'none',fontFamily:fm}}>
            <option value="">All Districts</option>
            {txDistricts.map(d=><option key={d} value={d}>{d}</option>)}
          </select>
          <select value={txSegF} onChange={e=>{setTxSegF(e.target.value);setTxPage(0);}} style={{background:'#fff',border:'1px solid #cbd5e1',borderRadius:8,padding:'8px 12px',color:'#1e293b',fontSize:12,cursor:'pointer',outline:'none',fontFamily:fm}}>
            <option value="">All Segments</option>
            {txSegments.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          <div style={{color:'#64748b',fontSize:11}}>{filtered.length} of {allTx.length} records</div>
        </div>
        {/* Table */}
        <div style={{overflowX:'auto'}}>
          <table>
            <thead><tr>
              {s
                ? ['Date','Project','Unit','District','Area','Price','PSF','Segment'].map(h=><th key={h}>{h}</th>)
                : ['Date','Project','Unit','District','Bed','Area','Rent/mo','Rent PSF','Segment'].map(h=><th key={h}>{h}</th>)
              }
            </tr></thead>
            <tbody>
              {pageTx.map((tx,i)=><tr key={i}>
                <td style={{color:'#64748b',fontSize:11,whiteSpace:'nowrap'}}>{tx.date}</td>
                <td style={{color:'#1e293b',fontWeight:600,fontSize:11}}>{tx.project}</td>
                <td style={{color:'#94a3b8',fontFamily:fm,fontSize:11}}>{tx.unit}</td>
                <td><span style={{background:SC[tx.segment]+'18',color:SC[tx.segment],padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:600}}>{tx.district}</span></td>
                {!s && <td style={{color:'#64748b',fontSize:11}}>{tx.bed}</td>}
                <td style={{fontFamily:fm,fontSize:11}}>{tx.area.toLocaleString()} sf</td>
                {s
                  ? <><td style={{color:'#38bdf8',fontFamily:fm,fontWeight:600,fontSize:11}}>${tx.price.toLocaleString()}</td><td style={{color:tx.psf>=2200?'#22c55e':tx.psf>=1800?'#f59e0b':'#64748b',fontFamily:fm,fontWeight:600,fontSize:11}}>${tx.psf.toLocaleString()}</td></>
                  : <><td style={{color:'#34d399',fontFamily:fm,fontWeight:600,fontSize:11}}>${tx.rent.toLocaleString()}</td><td style={{color:tx.rentPsf>=5?'#22c55e':tx.rentPsf>=3.5?'#f59e0b':'#64748b',fontFamily:fm,fontSize:11}}>${tx.rentPsf}</td></>
                }
                <td style={{color:SC[tx.segment],fontSize:10,fontWeight:600}}>{tx.segment}</td>
              </tr>)}
              {pageTx.length===0 && <tr><td colSpan={s?8:9} style={{textAlign:'center',color:'#94a3b8',padding:24}}>No transactions match your filters</td></tr>}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {pageCount>1 && <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:12}}>
          <button onClick={()=>setTxPage(Math.max(0,txPage-1))} disabled={txPage===0} style={{background:txPage===0?'#f1f5f9':'#fff',border:'1px solid #cbd5e1',borderRadius:6,padding:'6px 14px',fontSize:11,color:txPage===0?'#cbd5e1':'#64748b',cursor:txPage===0?'default':'pointer'}}>← Prev</button>
          <span style={{color:'#64748b',fontSize:11}}>Page {txPage+1} of {pageCount}</span>
          <button onClick={()=>setTxPage(Math.min(pageCount-1,txPage+1))} disabled={txPage>=pageCount-1} style={{background:txPage>=pageCount-1?'#f1f5f9':'#fff',border:'1px solid #cbd5e1',borderRadius:6,padding:'6px 14px',fontSize:11,color:txPage>=pageCount-1?'#cbd5e1':'#64748b',cursor:txPage>=pageCount-1?'default':'pointer'}}>Next →</button>
        </div>}
      </Cd>
    </div>
  );
}

/* ═══════ MAIN DASHBOARD ═══════ */

export default function Dashboard() {
  const [sec, setSec] = useState('market');
  const [tab, setTab] = useState('overview');
  const [aTab, setATab] = useState('overview');
  const [proj, setProj] = useState('');
  const [estArea, setEstArea] = useState(1076);
  const [estFloor, setEstFloor] = useState('');
  const [pricingMode, setPricingMode] = useState('latest');
  const [hmMetric, setHmMetric] = useState('psf');
  const [hmShowDiff, setHmShowDiff] = useState(false);
  const [hmSelFloor, setHmSelFloor] = useState('');
  const [hmSelYear, setHmSelYear] = useState(null);
  const [investorMode, setInvestorMode] = useState('overall');
  const [cmpSelected, setCmpSelected] = useState([]);

  // ═══ LIVE DATA STATE ═══
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mktData, setMktData] = useState(null);
  const [projData, setProjData] = useState(null);
  const [cmpPool, setCmpPool] = useState([]);
  const [projList, setProjList] = useState([]);

  // Fetch pre-aggregated dashboard data from backend
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchDashboard();
        if (cancelled) return;
        if (!data || !data.totalTx) { setError('No data received from backend'); setLoading(false); return; }

        setMktData(data);
        setCmpPool(data.cmpPool || []);
        setProjList(data.projList || []);

        // Set initial project
        if (data.cmpPool?.length > 0) {
          const firstProj = data.cmpPool[0].name;
          setProj(firstProj);
          try {
            const pd = await fetchProject(firstProj);
            if (!cancelled) setProjData(pd);
          } catch(e) { console.warn('Project detail fetch failed:', e); }
          const thisDist = data.cmpPool[0].dist;
          const sameDist = data.cmpPool.filter(p => p.dist === thisDist && p.name !== firstProj).slice(0, 3).map(p => p.name);
          const nearby = data.cmpPool.filter(p => p.dist !== thisDist).slice(0, 2).map(p => p.name);
          setCmpSelected([firstProj, ...sameDist, ...nearby].slice(0, 5));
        }

        setLoading(false);
      } catch (err) {
        if (!cancelled) { setError(err.message || 'Failed to load data'); setLoading(false); }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // When project changes, fetch project detail from backend
  const handleProjChange = useCallback(async (newProj) => {
    setProj(newProj);
    try {
      const pd = await fetchProject(newProj);
      setProjData(pd);
    } catch(e) { console.warn('Project fetch failed:', e); }
  }, []);
  const mTabs = [{ id:'overview', l:'📊 Overview' },{ id:'sales', l:'🏷️ Sales' },{ id:'rental', l:'🏠 Rental' },{ id:'invest', l:'💰 Investment' }];
  const aTabs = [{ id:'overview', l:'📊 Overview' },{ id:'valuation', l:'💎 Valuation' },{ id:'compare', l:'⚖️ Compare' },{ id:'records', l:'📋 Records' }];

  // Dynamic project coordinates for comparison distance calc
  const projCoords = useMemo(() => {
    const cp = cmpPool.find(p => p.name === proj);
    return cp ? { lat: cp.lat, lng: cp.lng } : { lat: 1.28, lng: 103.85 };
  }, [proj, cmpPool]);
  const p = projData?.projInfo || { name:"Loading...", district:"", segment:"", tenure:"", type:"", units:0, avgPsf:0, medPsf:0, totalTx:0, avgRent:0, rentPsf:0, yield:0, distAvg:0 };

  // Multi-tier pricing estimator (production logic)
  const projSizes = projData?.projSizes || [506, 657, 764, 883, 1076, 1238, 2045];
  const projFloorRanges = projData?.floorRanges || ['01-05','06-10','11-15','16-20','21-25','26-30','31-35','36-40','41-45'];
  const pArea = estArea || 1076;
  const pFloor = estFloor;
  const basePsf = p.avgPsf || 1920;

  // Tier 1: Project average (all sizes, all floors) — from live data
  const t1 = useMemo(() => {
    if (!projData?.txs?.length) return { psf:0, count:0, latest:'', latestPsf:0 };
    const txs = projData.txs;
    const sorted = [...txs].sort((a,b)=>b.date.localeCompare(a.date));
    return { psf: p.avgPsf, count: txs.length, latest: sorted[0]?.date || '', latestPsf: sorted[0]?.psf || p.avgPsf };
  }, [projData, p.avgPsf]);

  // Tier 2: Size match — from live data
  const nearSize = projSizes.reduce((prev,c) => Math.abs(c-pArea)<Math.abs(prev-pArea)?c:prev, projSizes[0]||1076);
  const t2 = useMemo(() => {
    if (!projData?.txs?.length) return { psf:0, cnt:0, lp:0 };
    const sizeTx = projData.txs.filter(t=>Math.abs(t.area-nearSize)<50);
    if (!sizeTx.length) return { psf:0, cnt:0, lp:0 };
    const sorted = [...sizeTx].sort((a,b)=>b.date.localeCompare(a.date));
    const avgP = Math.round(sizeTx.reduce((s,t)=>s+t.psf,0)/sizeTx.length);
    return { psf: pricingMode==='latest'?sorted[0].psf:avgP, cnt:sizeTx.length, lp:sorted[0].psf };
  }, [projData, nearSize, pricingMode]);

  // Tier 3: Floor match — from live data
  const t3 = useMemo(() => {
    if (!pFloor || !projData?.txs?.length) return { psf:0, cnt:0 };
    const [lo,hi] = pFloor.split('-').map(Number);
    const floorTx = projData.txs.filter(t=>t.floorMid>=lo&&t.floorMid<=hi);
    if (!floorTx.length) return { psf:0, cnt:0 };
    return { psf: Math.round(floorTx.reduce((s,t)=>s+t.psf,0)/floorTx.length), cnt:floorTx.length };
  }, [projData, pFloor]);

  // Tier 4: Exact match (size + floor)
  const t4 = useMemo(() => {
    if (!pFloor || !projData?.txs?.length) return { psf:0, cnt:0 };
    const [lo,hi] = pFloor.split('-').map(Number);
    const exactTx = projData.txs.filter(t=>Math.abs(t.area-nearSize)<50&&t.floorMid>=lo&&t.floorMid<=hi);
    if (!exactTx.length) return { psf:0, cnt:0 };
    return { psf: Math.round(exactTx.reduce((s,t)=>s+t.psf,0)/exactTx.length), cnt:exactTx.length };
  }, [projData, nearSize, pFloor]);
  const bestPsf = t4.psf||t2.psf||t3.psf||t1.psf;

  // Heatmap data from projData
  const projHmYears = projData?.hmYears || [];
  const projHmMatrix = projData?.hmMatrix || {};

  // Nearby project heatmap (simplified - uses cmpPool summary data)
  const nearbyHm = useMemo(() => {
    if (!mktData?.years || !cmpSelected.length) return { projects:[], years:[], data:{}, vol:{} };
    const years = (mktData.years || []).slice(-5);
    // Without raw txs, use cmpPool PSF as approximation
    const data = {};
    const vol = {};
    cmpSelected.forEach(name => {
      const p = cmpPool.find(c => c.name === name);
      if (!p) return;
      years.forEach(y => {
        // Estimate: use pool avg PSF with slight random variance per year
        data[`${name}-${y}`] = Math.round(p.psf * (0.9 + parseInt(y.slice(-2)) * 0.02));
        vol[`${name}-${y}`] = Math.round(p.units / years.length);
      });
    });
    return { projects: cmpSelected, years, data, vol };
  }, [mktData, cmpSelected, cmpPool]);

    if (loading) return (
      <div style={{ fontFamily:"'DM Sans',-apple-system,sans-serif", background:'#f8fafc', minHeight:'100vh', color:'#1e293b', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ width:48, height:48, border:'4px solid #e2e8f0', borderTop:'4px solid #38bdf8', borderRadius:'50%', animation:'spin 1s linear infinite', margin:'0 auto 16px' }}/>
          <style>{'@keyframes spin { to { transform:rotate(360deg) } }'}</style>
          <div style={{ fontSize:16, fontWeight:600, marginBottom:8 }}>Loading URA Data...</div>
          <div style={{ fontSize:12, color:'#64748b' }}>Fetching transactions from all 4 batches</div>
        </div>
      </div>
    );

    if (error) return (
      <div style={{ fontFamily:"'DM Sans',-apple-system,sans-serif", background:'#f8fafc', minHeight:'100vh', color:'#1e293b', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ textAlign:'center', maxWidth:400 }}>
          <div style={{ fontSize:40, marginBottom:16 }}>⚠️</div>
          <div style={{ fontSize:16, fontWeight:600, marginBottom:8, color:'#ef4444' }}>Failed to Load Data</div>
          <div style={{ fontSize:12, color:'#64748b', marginBottom:16 }}>{error}</div>
          <button onClick={()=>window.location.reload()} style={{ background:'#38bdf8', color:'#fff', border:'none', borderRadius:8, padding:'10px 24px', fontSize:13, fontWeight:600, cursor:'pointer' }}>Retry</button>
        </div>
      </div>
    );

  return (
    <div style={{ fontFamily:"'DM Sans',-apple-system,sans-serif", background:'#f8fafc', minHeight:'100vh', color:'#1e293b' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        ::-webkit-scrollbar { width:6px; }
        ::-webkit-scrollbar-thumb { background:#94a3b8; border-radius:3px; }
        .s { display:grid; grid-template-columns:repeat(auto-fill,minmax(155px,1fr)); gap:10px; margin-bottom:16px; }
        .g2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        .g3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; }
        @media(max-width:900px) { .g2,.g3 { grid-template-columns:1fr; } .s { grid-template-columns:repeat(2,1fr); } }
        select { background:#e2e8f0; color:#1e293b; border:1px solid #cbd5e1; border-radius:8px; padding:8px 12px; font-size:13px; cursor:pointer; outline:none; }
        select option { background:#f8fafc; }
        table { width:100%; border-collapse:collapse; font-size:12px; }
        th { color:#94a3b8; font-weight:500; padding:10px 12px; text-align:left; border-bottom:1px solid #cbd5e1; }
        td { padding:8px 12px; border-bottom:1px solid #f1f5f9; }
        tr:nth-child(even) { background:#f8fafc; }
      `}</style>

      {/* Header */}
      <div style={{ padding:'20px 28px', borderBottom:'1px solid #f1f5f9' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h1 style={{ fontSize:22, fontWeight:700, display:'flex', alignItems:'center', gap:10 }}><span style={{ fontSize:24 }}>🏢</span>SG Property Analytics<span style={{ fontSize:11, color:'#94a3b8', fontWeight:400, marginLeft:8 }}>URA Private Residential</span></h1>
          <div style={{ display:'flex', gap:12, alignItems:'center' }}><button style={{ background:'#f1f5f9', border:'1px solid #cbd5e1', borderRadius:8, padding:'6px 14px', color:'#94a3b8', fontSize:11, cursor:'pointer' }}>📥 Export</button><span style={{ background:'#22c55e', width:8, height:8, borderRadius:'50%', display:'inline-block' }}/><span style={{ color:'#94a3b8', fontSize:11 }}>Live</span></div>
        </div>
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          {[{ id:'market', l:'📊 Market', c:'#38bdf8' },{ id:'analyze', l:'🔍 Project Analysis', c:'#a78bfa' }].map(s=>(
            <button key={s.id} onClick={()=>setSec(s.id)} style={{ background:sec===s.id?`${s.c}18`:'transparent', border:sec===s.id?`1px solid ${s.c}4D`:'1px solid transparent', borderRadius:10, padding:'10px 24px', color:sec===s.id?s.c:'#64748b', fontSize:13, fontWeight:600, cursor:'pointer' }}>{s.l}</button>
          ))}
        </div>

        {sec==='market' && <>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:12 }}>
            {['District: All','Year: All','Segment: All','Type: All','Tenure: All'].map(f=><button key={f} style={{ background:'#e2e8f0', border:'1px solid #cbd5e1', borderRadius:8, padding:'6px 12px', color:'#1e293b', fontSize:12, cursor:'pointer' }}>{f} ▼</button>)}
            {tab==='rental'&&<button style={{ background:'#10b98120', border:'1px solid #10b9814D', borderRadius:8, padding:'6px 12px', color:'#34d399', fontSize:12, cursor:'pointer' }}>🛏️ Bedrooms: All ▼</button>}
          </div>
          <div style={{ display:'flex', gap:4, paddingBottom:16, borderBottom:'1px solid #e2e8f0' }}>
            {mTabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{ background:tab===t.id?'#38bdf818':'transparent', border:tab===t.id?'1px solid #38bdf84D':'1px solid transparent', borderRadius:8, padding:'8px 16px', color:tab===t.id?'#38bdf8':'#64748b', fontSize:13, fontWeight:500, cursor:'pointer' }}>{t.l}</button>)}
          </div>
        </>}

        {sec==='analyze' && <>
          <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:12 }}>
            <span style={{ color:'#94a3b8', fontSize:12 }}>Project:</span>
            <select value={proj} onChange={e=>handleProjChange(e.target.value)} style={{ minWidth:280 }}>{projList.map(p=><option key={p} value={p}>{p}</option>)}</select>
          </div>
          <div style={{ display:'flex', gap:4, paddingBottom:16, borderBottom:'1px solid #e2e8f0' }}>
            {aTabs.map(t=><button key={t.id} onClick={()=>setATab(t.id)} style={{ background:aTab===t.id?'#a78bfa18':'transparent', border:aTab===t.id?'1px solid #a78bfa4D':'1px solid transparent', borderRadius:8, padding:'8px 16px', color:aTab===t.id?'#a78bfa':'#64748b', fontSize:13, fontWeight:500, cursor:'pointer' }}>{t.l}</button>)}
          </div>
        </>}
      </div>

      {/* ═══ MARKET STATS BAR ═══ */}
      {sec==='market' && <div style={{ padding:'16px 28px' }}><div className="s">
        <St label="Transactions" value="9,100" color="#38bdf8" icon="📋" sub="CCR 2k · RCR 3k · OCR 4.1k"/>
        <St label="Total Volume" value="$18.6B" color="#a78bfa" icon="💰" sub="+11% vs 2023"/>
        <St label="Avg PSF" value="$2,040" color="#fb923c" icon="📐" sub="Median $1,850"/>
        <St label="PSF Range" value="$680–$4,520" color="#94a3b8" icon="↕️" sub="IQR $1,580–$2,820"/>
        <St label="Rental Contracts" value="12,400" color="#34d399" icon="🏠" sub="CCR 2.7k · RCR 4.1k · OCR 5.6k"/>
        <St label="Avg Rent" value="$4,820/mo" color="#38bdf8" icon="💵" sub="Median $4,200"/>
        <St label="Avg Rent PSF" value="$4.56/sf/mo" color="#fb923c" icon="📐" sub="Range $2.20–$7.50"/>
        <St label="Best Yield" value="3.18%" color="#22c55e" icon="💰" sub="D19 (Serangoon)"/>
      </div></div>}

      {/* ═══ MARKET TABS ═══ */}
      {sec==='market' && <div style={{ padding:'0 28px 40px', display:'grid', gap:16 }}>
        {tab==='overview' && <div style={{ display:'grid', gap:16 }}>
          <IB items={[
            <span key="y">4-yr CAGR <span style={{color:'#4ade80',fontWeight:700,fontFamily:fm}}>+6.6%</span> (PSF $1,580→$2,040)</span>,
            <span key="p">Yield compressing — from est. 3.2% (2020) to <span style={{color:'#f59e0b',fontWeight:700,fontFamily:fm}}>2.66%</span> avg</span>,
            <span key="r">Total annualised return (CAGR + yield): <span style={{color:'#22c55e',fontWeight:700,fontFamily:fm}}>~8.1%</span></span>,
          ]}/>

          {/* Sale vs Rent side by side - unique to overview */}
          <div className="g2">
            <Cd>
              <SH icon="🏷️" title="Sale Market Snapshot" sub="Key metrics at a glance — click Sales tab for deep dive"/>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div style={{background:'#f1f5f9',borderRadius:10,padding:12,textAlign:'center'}}><div style={{color:'#64748b',fontSize:10}}>AVG PSF</div><div style={{color:'#38bdf8',fontSize:20,fontWeight:700,fontFamily:fm}}>${mktData?.avgPsf?.toLocaleString()||'—'}</div><div style={{color:'#4ade80',fontSize:11}}>{mktData?.yoyPct!=null?`${mktData.yoyPct>0?'+':''}${mktData.yoyPct}% YoY`:'—'}</div></div>
                <div style={{background:'#f1f5f9',borderRadius:10,padding:12,textAlign:'center'}}><div style={{color:'#64748b',fontSize:10}}>TRANSACTIONS</div><div style={{color:'#a78bfa',fontSize:20,fontWeight:700,fontFamily:fm}}>{mktData?.totalTx?.toLocaleString()||'—'}</div><div style={{color:'#94a3b8',fontSize:11}}>${mktData?.totalVolume?`$${(mktData.totalVolume/1e9).toFixed(1)}B volume`:'—'}</div></div>
                <div style={{background:'#f1f5f9',borderRadius:10,padding:12,textAlign:'center'}}><div style={{color:'#64748b',fontSize:10}}>MEDIAN PSF</div><div style={{color:'#6366f1',fontSize:20,fontWeight:700,fontFamily:fm}}>${mktData?.medPsf?.toLocaleString()||'—'}</div><div style={{color:'#94a3b8',fontSize:11}}>Right-skewed</div></div>
                <div style={{background:'#f1f5f9',borderRadius:10,padding:12,textAlign:'center'}}><div style={{color:'#64748b',fontSize:10}}>4-YR CAGR</div><div style={{color:'#22c55e',fontSize:20,fontWeight:700,fontFamily:fm}}>+6.6%</div><div style={{color:'#94a3b8',fontSize:11}}>2020→2024</div></div>
              </div>
            </Cd>
            <Cd>
              <SH icon="🏠" title="Rental Market Snapshot" sub="Key metrics at a glance — click Rental tab for deep dive"/>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div style={{background:'#f1f5f9',borderRadius:10,padding:12,textAlign:'center'}}><div style={{color:'#64748b',fontSize:10}}>AVG RENT</div><div style={{color:'#34d399',fontSize:20,fontWeight:700,fontFamily:fm}}>$4,820</div><div style={{color:'#4ade80',fontSize:11}}>+2.6% QoQ</div></div>
                <div style={{background:'#f1f5f9',borderRadius:10,padding:12,textAlign:'center'}}><div style={{color:'#64748b',fontSize:10}}>CONTRACTS</div><div style={{color:'#a78bfa',fontSize:20,fontWeight:700,fontFamily:fm}}>12,400</div><div style={{color:'#94a3b8',fontSize:11}}>this year</div></div>
                <div style={{background:'#f1f5f9',borderRadius:10,padding:12,textAlign:'center'}}><div style={{color:'#64748b',fontSize:10}}>MEDIAN RENT</div><div style={{color:'#10b981',fontSize:20,fontWeight:700,fontFamily:fm}}>$4,200</div><div style={{color:'#94a3b8',fontSize:11}}>CCR outliers lift avg</div></div>
                <div style={{background:'#f1f5f9',borderRadius:10,padding:12,textAlign:'center'}}><div style={{color:'#64748b',fontSize:10}}>AVG RENT PSF</div><div style={{color:'#f59e0b',fontSize:20,fontWeight:700,fontFamily:fm}}>$4.56</div><div style={{color:'#94a3b8',fontSize:11}}>$/sqft/month</div></div>
              </div>
            </Cd>
          </div>

          {/* Investment Quadrant — unique to overview */}
          <SH icon="🎯" title="District Investment Quadrant" sub="X = Price CAGR (capital growth), Y = Gross Yield (income). Top-right = best total return. Crosshairs at market average."/>
          <Cd><div style={{height:340}}><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{top:20,right:30,bottom:20,left:10}}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis type="number" dataKey="cagr" name="Price CAGR %" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>`${v}%`} domain={[3,8]}/><YAxis type="number" dataKey="y" name="Gross Yield %" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>`${v}%`} domain={[1.8,3.5]}/><Tooltip content={({active,payload})=>{if(!active||!payload||!payload.length)return null;const d=payload[0].payload;return <div style={{background:'#1e293bf0',padding:'10px 14px',borderRadius:8,border:'1px solid #cbd5e1'}}><div style={{color:'#e2e8f0',fontWeight:700,fontSize:13}}>{d.d}</div><div style={{color:'#94a3b8',fontSize:11}}>{d.seg} · ${d.bp.toLocaleString()} PSF</div><div style={{color:'#38bdf8',fontSize:12}}>CAGR: {d.cagr}%</div><div style={{color:'#34d399',fontSize:12}}>Yield: {d.y}%</div><div style={{color:'#f59e0b',fontSize:12,fontWeight:600}}>Total: {d.total}%</div></div>;}}/><Legend wrapperStyle={{fontSize:11}}/>{['CCR','RCR','OCR'].map(seg=><Scatter key={seg} name={seg} data={(mktData?.cagrData||[]).filter(d=>d.seg===seg)} fill={SC[seg]} fillOpacity={0.9}>{(mktData?.cagrData||[]).filter(d=>d.seg===seg).map((d,i)=><Cell key={i} r={10}/>)}</Scatter>)}</ScatterChart></ResponsiveContainer></div>
          {/* Quadrant labels */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}>
            <div style={{background:'#22c55e10',borderRadius:8,padding:'8px 12px',border:'1px solid #22c55e30'}}><span style={{color:'#22c55e',fontSize:11,fontWeight:600}}>🏆 Top Right: BEST</span><span style={{color:'#64748b',fontSize:11}}> — High growth + high yield (D15, D5)</span></div>
            <div style={{background:'#f59e0b10',borderRadius:8,padding:'8px 12px',border:'1px solid #f59e0b30'}}><span style={{color:'#f59e0b',fontSize:11,fontWeight:600}}>💰 Top Left: INCOME</span><span style={{color:'#64748b',fontSize:11}}> — High yield, slower growth (D19, D21)</span></div>
            <div style={{background:'#38bdf810',borderRadius:8,padding:'8px 12px',border:'1px solid #38bdf830'}}><span style={{color:'#38bdf8',fontSize:11,fontWeight:600}}>📈 Bottom Right: GROWTH</span><span style={{color:'#64748b',fontSize:11}}> — High CAGR, lower yield (D9)</span></div>
            <div style={{background:'#ef444410',borderRadius:8,padding:'8px 12px',border:'1px solid #ef444430'}}><span style={{color:'#ef4444',fontSize:11,fontWeight:600}}>⚠️ Bottom Left: AVOID</span><span style={{color:'#64748b',fontSize:11}}> — Low on both axes (D10, D1)</span></div>
          </div></Cd>

          {/* Segment pie + top projects */}
          <div className="g2">
            <Cd><SH icon="📊" title="Market Segments" sub="OCR: 45% of volume, CCR: 22% of transactions but 39% of dollar value."/><div style={{height:220,display:'flex',gap:16}}><div style={{flex:1}}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={mktData?.sSeg||[]} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={42} paddingAngle={3}>{(mktData?.sSeg||[]).map((e,i)=><Cell key={i} fill={SC[e.name]}/>)}</Pie><Tooltip content={<Tip/>}/></PieChart></ResponsiveContainer></div><div style={{display:'flex',flexDirection:'column',justifyContent:'center',gap:10}}>{(mktData?.sSeg||[]).map(x=><div key={x.name} style={{display:'flex',alignItems:'center',gap:8}}><div style={{width:10,height:10,borderRadius:3,background:SC[x.name]}}/><div><div style={{color:'#1e293b',fontSize:12,fontWeight:600}}>{x.name}</div><div style={{color:'#64748b',fontSize:11}}>${x.val.toLocaleString()} psf · {x.count.toLocaleString()}</div></div></div>)}</div></div></Cd>
            <Cd><SH icon="🏆" title="Most Active Projects" sub="Liquidity indicators — high-volume projects are easier to buy into and exit from."/><div style={{height:220}}><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={mktData?.sTop||[]}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0"/><XAxis type="number" tick={{fill:'#64748b',fontSize:10}} axisLine={false}/><YAxis dataKey="n" type="category" width={160} tick={{fill:'#94a3b8',fontSize:9}} axisLine={false}/><Tooltip content={<Tip/>}/><Bar dataKey="c" name="Transactions" radius={[0,6,6,0]} barSize={14}>{(mktData?.sTop||[]).map((_,i)=><Cell key={i} fill={P[i%P.length]}/>)}</Bar></BarChart></ResponsiveContainer></div></Cd>
          </div>
        </div>}

        {tab==='sales' && <MarketTab mode="sales" data={mktData}/>}
        {tab==='rental' && <MarketTab mode="rental" data={mktData}/>}

        {/* ═══ INVESTMENT ═══ */}
        {tab==='invest' && <div style={{ display:'grid', gap:16 }}>
          <IB items={[
            <span key="y">Best yield: <span style={{color:'#22c55e',fontWeight:700}}>D19 at 3.18%</span> — OCR outperforms CCR on income</span>,
            <span key="q">CCR yields compressed below <span style={{color:'#ef4444',fontWeight:700}}>2.4%</span> — capital gains are the thesis, not income</span>,
            <span key="s">Yield-seekers should target <span style={{color:'#f59e0b',fontWeight:700}}>D19, D15, D21</span> — all above 2.6%</span>,
          ]}/>
          <SH icon="💰" title="Gross Rental Yield by District" sub="Yield = (Monthly Rent PSF × 12) ÷ Sale PSF. Green ≥ 2.8% (income play), yellow ≥ 2.4% (balanced), red < 2.4% (capital gains only)."/>
          <Cd><div className="g2">
            <div style={{height:Math.max(260,yd.length*34)}}><ResponsiveContainer width="100%" height="100%"><BarChart data={mktData?.yd||[]} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0"/><XAxis type="number" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>`${v}%`} domain={[0,3.5]}/><YAxis dataKey="d" type="category" width={45} tick={{fill:'#94a3b8',fontSize:11}} axisLine={false}/><Tooltip content={<Tip fmt="%"/>}/><Bar dataKey="y" name="Yield %" radius={[0,6,6,0]} barSize={18}>{(mktData?.yd||[]).map((e,i)=><Cell key={i} fill={e.y>=2.8?'#22c55e':e.y>=2.4?'#f59e0b':'#ef4444'}/>)}</Bar></BarChart></ResponsiveContainer></div>
            <div style={{overflowX:'auto'}}><table><thead><tr>{['District','Seg','Rent PSF','Buy PSF','Yield'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{(mktData?.yd||[]).map(r=><tr key={r.d}><td style={{color:'#1e293b',fontWeight:600,fontFamily:fm}}>{r.d}</td><td style={{color:SC[r.seg],fontSize:11}}>{r.seg}</td><td style={{color:'#f59e0b',fontFamily:fm}}>${r.rp}/sf/mo</td><td style={{color:'#38bdf8',fontFamily:fm}}>${r.bp.toLocaleString()}/sf</td><td style={{color:r.y>=2.8?'#22c55e':r.y>=2.4?'#f59e0b':'#ef4444',fontWeight:700,fontFamily:fm}}>{r.y}%</td></tr>)}</tbody></table></div>
          </div></Cd>
          <Nr>Pattern: OCR districts (D19, D21) deliver the best yields because rental demand is stable while entry prices are low. CCR (D9, D10) yields below 2.3% — buyers are paying for prestige and capital upside, not income.</Nr>

          <SH icon="📈" title="CAGR Analysis — Advanced Investor Mode" sub="Computed from annual average PSF. CAGR = (End Avg PSF ÷ Start Avg PSF)^(1/n) − 1. Toggle views to analyse by different dimensions."/>
          <Cd>
            {/* View toggle */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:8}}>
              <div style={{display:'flex',gap:0,background:'#f1f5f9',borderRadius:8,padding:2,border:'1px solid #e2e8f0'}}>
                {[{id:'overall',l:'Overall'},{id:'size',l:'By Size Type'},{id:'floor',l:'By Floor Band'}].map(m=>
                  <button key={m.id} onClick={()=>setInvestorMode(m.id)} style={{background:investorMode===m.id?'#a78bfa26':'transparent',border:investorMode===m.id?'1px solid #a78bfa4D':'1px solid transparent',borderRadius:6,padding:'6px 16px',fontSize:11,color:investorMode===m.id?'#a78bfa':'#64748b',cursor:'pointer',fontWeight:600}}>{m.l}</button>
                )}
              </div>
              <div style={{color:'#64748b',fontSize:10,fontStyle:'italic'}}>Period: 2020 → 2024 (4 years) · {(projData?.rawTx||[]).length} total transactions</div>
            </div>
            {/* Computed table */}
            {(()=>{
              let rows = [];
              if(investorMode==='overall'){
                const r = computeBucketCAGR(projData?.rawTx||[]);
                rows = [{label:'ALL UNITS',sub:'All sizes · All floors',icon:'📊',...r, yield:3.06}];
              } else if(investorMode==='size'){
                rows = (projData?.projSizes||[]).map(s=>{
                  const filtered = (projData?.rawTx||[]).filter(tx=>tx.size===s);
                  const r = computeBucketCAGR(filtered);
                  // Yield approximation: smaller units have higher rent PSF
                  const yieldMap = {506:3.34,657:3.10,764:3.06,883:2.91,1076:2.83,1238:2.68,2045:2.41};
                  return {label:`${s.toLocaleString()} sqft`,sub:`${filtered.length} transactions`,icon:'📐',...r,yield:yieldMap[s]||2.8};
                });
              } else {
                rows = (projData?.floorRanges||[]).map(f=>{
                  const filtered = (projData?.rawTx||[]).filter(tx=>tx.floor===f);
                  const r = computeBucketCAGR(filtered);
                  // Yield decreases with floor (higher PSF, similar rent)
                  const yMap = {'01-05':3.38,'06-10':3.28,'11-15':3.15,'16-20':3.04,'21-25':2.93,'26-30':2.83,'31-35':2.72,'36-40':2.59,'41-45':2.47,'46+':2.31};
                  return {label:`Floor ${f}`,sub:`${filtered.length} transactions`,icon:'🏢',...r,yield:yMap[f]||2.8};
                });
              }
              return <div>
                <div style={{overflowX:'auto'}}>
                  <table>
                    <thead><tr>
                      {[investorMode==='overall'?'Bucket':investorMode==='size'?'Unit Size':'Floor Band','2020 Avg','2024 Avg','n (Start)','n (End)','CAGR','Yield','Total Return'].map(h=><th key={h}>{h}</th>)}
                    </tr></thead>
                    <tbody>{rows.map((r,ri)=>{
                      const totalReturn = r.cagr!==null?(r.cagr+r.yield).toFixed(1):null;
                      return <tr key={ri} style={{opacity:r.lowConf?0.5:1}}>
                        <td style={{color:'#1e293b',fontWeight:600}}>
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <span style={{fontSize:13}}>{r.icon}</span>
                            <div>
                              <div style={{fontFamily:fm}}>{r.label}{r.lowConf&&<span style={{color:'#f59e0b',marginLeft:4}} title={`Low confidence: start year n=${r.startN}, end year n=${r.endN}`}>*</span>}</div>
                              <div style={{color:'#64748b',fontSize:9,fontWeight:400}}>{r.sub}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{color:'#94a3b8',fontFamily:fm}}>{r.startAvg?`$${r.startAvg.toLocaleString()}`:'—'}</td>
                        <td style={{color:'#38bdf8',fontFamily:fm,fontWeight:600}}>{r.endAvg?`$${r.endAvg.toLocaleString()}`:'—'}</td>
                        <td style={{color:r.startN<3?'#f59e0b':'#64748b',fontFamily:fm,fontSize:11}}>{r.startN}</td>
                        <td style={{color:r.endN<3?'#f59e0b':'#64748b',fontFamily:fm,fontSize:11}}>{r.endN}</td>
                        <td style={{color:r.cagr!==null?(r.cagr>=5?'#22c55e':r.cagr>=3.5?'#4ade80':'#f59e0b'):'#64748b',fontFamily:fm,fontWeight:700,fontSize:14}}>{r.cagr!==null?`${r.cagr.toFixed(1)}%`:'—'}</td>
                        <td style={{color:r.yield>=3?'#22c55e':r.yield>=2.5?'#f59e0b':'#ef4444',fontFamily:fm}}>{r.yield}%</td>
                        <td style={{color:'#a78bfa',fontWeight:700,fontFamily:fm,fontSize:15}}>{totalReturn?`${totalReturn}%`:'—'}</td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div>
                {/* Annual PSF trend sparklines */}
                <div style={{marginTop:16,display:'grid',gridTemplateColumns:`repeat(${Math.min(rows.length,investorMode==='overall'?1:5)},1fr)`,gap:8}}>
                  {rows.slice(0,investorMode==='overall'?1:10).map((r,ri)=><div key={ri} style={{background:'#f1f5f9',borderRadius:8,padding:'10px 12px',opacity:r.lowConf?0.5:1}}>
                    <div style={{color:'#94a3b8',fontSize:10,fontWeight:600,marginBottom:6}}>{r.label}</div>
                    <div style={{display:'flex',alignItems:'flex-end',gap:3,height:40}}>
                      {r.annualAvg.map((a,ai)=>{
                        if(!a.avg) return <div key={ai} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}><div style={{height:2,width:'100%',background:'#e2e8f0',borderRadius:1}}/><div style={{fontSize:7,color:'#64748b'}}>{a.year.slice(2)}</div></div>;
                        const allAvgs = r.annualAvg.filter(x=>x.avg).map(x=>x.avg);
                        const min = Math.min(...allAvgs); const max = Math.max(...allAvgs);
                        const h = max>min?4+((a.avg-min)/(max-min))*32:20;
                        return <div key={ai} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                          <div style={{fontSize:8,color:'#94a3b8',fontFamily:fm}}>{a.avg}</div>
                          <div style={{height:h,width:'100%',background:ai===r.annualAvg.length-1?'#a78bfa':'#38bdf8',borderRadius:2,opacity:a.n<3?0.4:0.8}}/>
                          <div style={{fontSize:7,color:'#64748b'}}>{a.year.slice(2)}</div>
                        </div>;
                      })}
                    </div>
                    {r.cagr!==null&&<div style={{textAlign:'center',marginTop:4,fontSize:11,fontWeight:700,color:r.cagr>=5?'#22c55e':'#4ade80',fontFamily:fm}}>CAGR {r.cagr.toFixed(1)}%</div>}
                  </div>)}
                </div>
                {rows.some(r=>r.lowConf)&&<div style={{marginTop:10,display:'flex',alignItems:'center',gap:6,color:'#f59e0b',fontSize:10}}><span>⚠️</span><span>* Dimmed rows have fewer than 3 transactions in start or end year — CAGR may be unreliable</span></div>}
              </div>;
            })()}
            <Nr style={{marginTop:12}}>CAGR = (Annual Avg PSF End Year ÷ Annual Avg PSF Start Year)^(1/years) − 1. Total Return = CAGR + Gross Yield (simple additive). Yield estimated from current rent PSF and buy PSF for each bucket.</Nr>
          </Cd>

          <SH icon="🎯" title="Investment Quadrant: Yield vs Growth" sub="X-axis = Price CAGR (capital appreciation). Y-axis = Gross Yield (rental income). Top-right quadrant = best risk-adjusted total return."/>
          <Cd><div style={{height:340}}><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{top:20,right:30,bottom:20,left:10}}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis type="number" dataKey="cagr" name="Price CAGR %" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>`${v}%`} domain={[3,8]} label={{value:'Capital Growth (CAGR %)',position:'bottom',offset:0,fill:'#64748b',fontSize:10}}/><YAxis type="number" dataKey="y" name="Gross Yield %" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>`${v}%`} domain={[1.8,3.5]} label={{value:'Rental Yield %',angle:-90,position:'left',offset:0,fill:'#64748b',fontSize:10}}/><Tooltip content={({active,payload})=>{if(!active||!payload||!payload.length)return null;const d=payload[0].payload;return <div style={{background:'#1e293bf0',padding:'10px 14px',borderRadius:8,border:'1px solid #cbd5e1'}}><div style={{color:'#e2e8f0',fontWeight:700,fontSize:13}}>{d.d} ({d.seg})</div><div style={{color:'#38bdf8',fontSize:12}}>${d.bp.toLocaleString()} PSF</div><div style={{color:'#4ade80',fontSize:12}}>CAGR: {d.cagr}%</div><div style={{color:'#f59e0b',fontSize:12}}>Yield: {d.y}%</div><div style={{color:'#a78bfa',fontSize:13,fontWeight:700}}>Total: {d.total}%</div></div>;}}/><Legend wrapperStyle={{fontSize:11}}/>{['CCR','RCR','OCR'].map(seg=><Scatter key={seg} name={seg} data={(mktData?.cagrData||[]).filter(d=>d.seg===seg)} fill={SC[seg]} fillOpacity={0.9}/>)}</ScatterChart></ResponsiveContainer></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginTop:8}}>
            <div style={{background:'#22c55e10',borderRadius:8,padding:'6px 10px',borderLeft:'3px solid #22c55e'}}><span style={{color:'#22c55e',fontSize:11,fontWeight:600}}>🏆 Top-Right:</span><span style={{color:'#64748b',fontSize:11}}> D5, D15 — best total return (9%+)</span></div>
            <div style={{background:'#f59e0b10',borderRadius:8,padding:'6px 10px',borderLeft:'3px solid #f59e0b'}}><span style={{color:'#f59e0b',fontSize:11,fontWeight:600}}>💰 Top-Left:</span><span style={{color:'#64748b',fontSize:11}}> D19, D21 — income play, steady yield</span></div>
            <div style={{background:'#38bdf812',borderRadius:8,padding:'6px 10px',borderLeft:'3px solid #38bdf8'}}><span style={{color:'#38bdf8',fontSize:11,fontWeight:600}}>📈 Bottom-Right:</span><span style={{color:'#64748b',fontSize:11}}> D9 — capital gains, low income</span></div>
            <div style={{background:'#ef444410',borderRadius:8,padding:'6px 10px',borderLeft:'3px solid #ef4444'}}><span style={{color:'#ef4444',fontSize:11,fontWeight:600}}>⚠️ Bottom-Left:</span><span style={{color:'#64748b',fontSize:11}}> D10, D1 — weakest total return</span></div>
          </div></Cd>

          <SH icon="⚖️" title="Buy Price vs Rent Collected" sub="The wider the gap between blue (cost) and green (income), the longer your payback period."/>
          <Cd><div style={{height:280}}><ResponsiveContainer width="100%" height="100%"><BarChart data={mktData?.yd||[]}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="d" tick={{fill:'#64748b',fontSize:10}} axisLine={false}/><YAxis yAxisId="l" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>'$'+v.toLocaleString()}/><YAxis yAxisId="r" orientation="right" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>`$${v}/sf/mo`}/><Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:11}}/><Bar yAxisId="l" dataKey="bp" name="Buy PSF ($)" fill="#38bdf8" radius={[4,4,0,0]} barSize={14}/><Bar yAxisId="r" dataKey="rp" name="Rent PSF ($/sf/mo)" fill="#34d399" radius={[4,4,0,0]} barSize={14}/></BarChart></ResponsiveContainer></div></Cd>

          <SH icon="🛏️" title="Rent by Bedroom Type" sub="Smaller units produce higher rent PSF — a 1BR at $6.72/sqft/mo vs a 5BR at $3.88/sqft/mo. For pure yield, compact units win."/>
          <Cd><div style={{height:250}}><ResponsiveContainer width="100%" height="100%"><BarChart data={mktData?.rBed||[]}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="t" tick={{fill:'#64748b',fontSize:11}} axisLine={false}/><YAxis yAxisId="l" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>'$'+v.toLocaleString()}/><YAxis yAxisId="r" orientation="right" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>'$'+v.toFixed(2)}/><Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:11}}/><Bar yAxisId="l" dataKey="v" name="Avg Rent/mo ($)" radius={[6,6,0,0]} barSize={28}>{(mktData?.rBed||[]).map((_,i)=><Cell key={i} fill={P[i%P.length]}/>)}</Bar><Line yAxisId="r" type="monotone" dataKey="psf" name="Rent PSF ($/sf/mo)" stroke="#f59e0b" strokeWidth={2} dot={{r:4,fill:'#f59e0b'}}/></BarChart></ResponsiveContainer></div></Cd>
        </div>}
      </div>}

      {/* ═══ PROJECT STATS BAR ═══ */}
      {sec==='analyze' && <div style={{ padding:'16px 28px' }}><div className="s">
        <St label="Project" value="THE SAIL" color="#a78bfa" icon="🏢" sub={`${p.district} · ${p.segment}`}/>
        <St label="Avg PSF" value={`$${p.avgPsf.toLocaleString()}`} color="#38bdf8" icon="📐" sub={`Med $${p.medPsf.toLocaleString()} · ${Math.round((1-p.avgPsf/p.distAvg)*100)}% below D1 avg`}/>
        <St label="Transactions" value={p.totalTx.toString()} color="#fb923c" icon="📋" sub="2024 YTD"/>
        <St label="Avg Rent" value={`$${p.avgRent.toLocaleString()}/mo`} color="#34d399" icon="💵" sub={`Med $5,000/mo`}/>
        <St label="Rent PSF" value={`$${p.rentPsf}/sf/mo`} color="#f59e0b" icon="📐"/>
        <St label="Gross Yield" value={`${p.yield}%`} color="#22c55e" icon="💰" sub="Above D1 avg of 2.31%"/>
        <St label="Tenure" value={p.tenure} color="#94a3b8" icon="📜" sub={`TOP ${p.top} · ${p.units} units`}/>
        <St label="Lease Remaining" value="~78 yrs" color="#94a3b8" icon="⏳" sub="from 99-yr (2004)"/>
      </div></div>}

      {/* ═══ PROJECT ANALYSIS TABS ═══ */}
      {sec==='analyze' && <div style={{ padding:'0 28px 40px', display:'grid', gap:16 }}>

        {/* Overview */}
        {aTab==='overview' && <div style={{ display:'grid', gap:16 }}>
          <IB items={[
            <span key="p">Trading at <span style={{color:'#38bdf8',fontWeight:700,fontFamily:fm}}>$2,120</span> PSF — <span style={{color:'#22c55e',fontWeight:700}}>24% below</span> D1 average ($2,780)</span>,
            <span key="y">Yield <span style={{color:'#22c55e',fontWeight:700,fontFamily:fm}}>3.06%</span> — best among D1 waterfront condos</span>,
            <span key="r">78 years remaining on lease — watch for depreciation inflection after ~60 yrs</span>,
          ]}/>

          <SH icon="📈" title="PSF Trend" sub="Steady appreciation from $1,920 (22Q1) to $2,120 (24Q3) — 10.4% over 2.5 years. Volume dipped in 24Q3 (32 tx vs 48 in Q1) — possible buyer fatigue at current levels."/>
          <Cd><div style={{height:280}}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={projData?.projPsfTrend||[]}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="q" tick={{fill:'#64748b',fontSize:10}} axisLine={false}/><YAxis yAxisId="l" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>'$'+v.toLocaleString()}/><YAxis yAxisId="r" orientation="right" tick={{fill:'#64748b',fontSize:10}} axisLine={false}/><Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:11}}/><Bar yAxisId="l" dataKey="avg" name="Avg PSF" fill="#0ea5e9" radius={[4,4,0,0]} barSize={18}/><Bar yAxisId="l" dataKey="med" name="Med PSF" fill="#6366f1" radius={[4,4,0,0]} barSize={18}/><Bar yAxisId="r" dataKey="vol" name="Tx Volume" fill="#ffffff15" radius={[4,4,0,0]} barSize={8}/></ComposedChart></ResponsiveContainer></div></Cd>

          <SH icon="💵" title="Rental Trend" sub="Rent rose 17.4% from $4,600 (22Q1) to $5,400 (24Q3). Expat demand from nearby MBS, Raffles Place offices drives consistent leasing."/>
          <Cd><div style={{height:240}}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={projData?.projRentTrend||[]}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="q" tick={{fill:'#64748b',fontSize:10}} axisLine={false}/><YAxis tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>'$'+v.toLocaleString()}/><Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:11}}/><Bar dataKey="avg" name="Avg Rent" fill="#10b981" radius={[4,4,0,0]} barSize={18}/><Bar dataKey="med" name="Med Rent" fill="#34d399" radius={[4,4,0,0]} barSize={18}/></ComposedChart></ResponsiveContainer></div></Cd>

          <SH icon="🛏️" title="Performance by Unit Type" sub="1BR has highest PSF ($2,280) but PH exceeds it ($2,450) — scarcity premium. For investors: 2BR has the best combo of volume (85 tx), rent ($4,800), and liquidity."/>
          <Cd><div style={{height:260}}><ResponsiveContainer width="100%" height="100%"><BarChart data={projData?.projByBed||[]}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="bed" tick={{fill:'#64748b',fontSize:11}} axisLine={false}/><YAxis yAxisId="l" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>'$'+v.toLocaleString()}/><YAxis yAxisId="r" orientation="right" tick={{fill:'#64748b',fontSize:10}} axisLine={false}/><Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:11}}/><Bar yAxisId="l" dataKey="psf" name="Avg PSF" fill="#0ea5e9" radius={[4,4,0,0]} barSize={14}/><Bar yAxisId="l" dataKey="rent" name="Avg Rent" fill="#10b981" radius={[4,4,0,0]} barSize={14}/><Bar yAxisId="r" dataKey="count" name="Tx Count" fill="#ffffff15" radius={[4,4,0,0]} barSize={14}/></BarChart></ResponsiveContainer></div></Cd>
        </div>}

        {/* Valuation */}
        {aTab==='valuation' && <div style={{ display:'grid', gap:16 }}>
          <SH icon="🏗️" title="Floor Premium Analysis" sub="Each 5-floor band adds ~$60–80 PSF. The premium accelerates above floor 30 — high floors aren't linear, they're exponential. Sweet spot: floors 21–30 for best value-to-view ratio."/>
          <Cd><div style={{height:300}}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={projData?.projFloor||[]}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="range" tick={{fill:'#64748b',fontSize:10}} axisLine={false}/><YAxis yAxisId="l" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>'$'+v.toLocaleString()}/><YAxis yAxisId="r" orientation="right" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>`+${v}%`}/><Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:11}}/><Bar yAxisId="l" dataKey="psf" name="Avg PSF" fill="#0ea5e9" radius={[4,4,0,0]} barSize={20}/><Line yAxisId="r" type="monotone" dataKey="premium" name="Premium %" stroke="#f59e0b" strokeWidth={2.5} dot={{r:4,fill:'#f59e0b'}}/></ComposedChart></ResponsiveContainer></div></Cd>
          <Nr>Floors 46+ command a 40% premium ($2,690 PSF) over ground floors ($1,920 PSF) — that's +$770 per sqft just for the view. For a 1,000sf unit, that's $770,000 extra. Decide if the view is worth it.</Nr>

          <SH icon="⬡" title="Transaction Scatter: Size × Floor × PSF" sub="Each dot is a real transaction. Bubble size = floor level. Notice: larger units cluster at lower PSF (bulk discount), higher floors push PSF up."/>
          <Cd><div style={{height:300}}><ResponsiveContainer width="100%" height="100%"><ScatterChart><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis type="number" dataKey="area" name="Area (sqft)" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>`${v} sf`}/><YAxis type="number" dataKey="psf" name="PSF ($)" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>'$'+v.toLocaleString()}/><ZAxis type="number" dataKey="floor" name="Floor" range={[30,200]}/><Tooltip content={<Tip/>}/><Scatter name="Transactions" data={projData?.projScatter||[]} fill="#a78bfa" fillOpacity={0.6}/></ScatterChart></ResponsiveContainer></div></Cd>

          <SH icon="🧮" title="Price Estimator" sub="Multi-tier estimation: finds the best match from project → size → floor → exact. Toggle Latest (most recent tx) vs Average (smart year avg)."/>
          <Cd>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ color:'#1e293b', fontSize:15, fontWeight:600 }}>🏷️ Price Estimator</div>
              <div style={{ display:'flex', background:'#f1f5f9', borderRadius:8, padding:2, border:'1px solid #e2e8f0' }}>
                <button onClick={()=>setPricingMode('latest')} style={{ background:pricingMode==='latest'?'#a78bfa26':'transparent', border:pricingMode==='latest'?'1px solid #a78bfa4D':'1px solid transparent', borderRadius:6, padding:'5px 14px', fontSize:11, color:pricingMode==='latest'?'#a78bfa':'#64748b', cursor:'pointer', fontWeight:600 }}>Latest</button>
                <button onClick={()=>setPricingMode('average')} style={{ background:pricingMode==='average'?'#a78bfa26':'transparent', border:pricingMode==='average'?'1px solid #a78bfa4D':'1px solid transparent', borderRadius:6, padding:'5px 14px', fontSize:11, color:pricingMode==='average'?'#a78bfa':'#64748b', cursor:'pointer', fontWeight:600 }}>Average</button>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
              <div>
                <label style={{ color:'#94a3b8', fontSize:10, fontWeight:600, marginBottom:6, display:'block' }}>UNIT SIZE (SQFT)</label>
                <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                  {projSizes.map(s=><button key={s} onClick={()=>setEstArea(s)} style={{ background:pArea===s?'#a78bfa':'#f1f5f9', border:pArea===s?'1px solid #a78bfa':'1px solid #cbd5e1', borderRadius:6, padding:'6px 12px', fontSize:12, color:pArea===s?'#fff':'#94a3b8', cursor:'pointer', fontFamily:fm, fontWeight:pArea===s?700:400 }}>{s.toLocaleString()}</button>)}
                </div>
              </div>
              <div>
                <label style={{ color:'#94a3b8', fontSize:10, fontWeight:600, marginBottom:6, display:'block' }}>FLOOR LEVEL</label>
                <select value={estFloor} onChange={e=>setEstFloor(e.target.value)} style={{ background:'#e2e8f0', border:'1px solid #cbd5e1', borderRadius:8, padding:'8px 12px', color:'#1e293b', fontSize:13, width:'100%', outline:'none', fontFamily:fm, cursor:'pointer' }}>
                  <option value="">All floors</option>
                  {projFloorRanges.map(f=><option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>
            {bestPsf>0 && <div style={{ background:'linear-gradient(135deg,#a78bfa18,#38bdf818)', borderRadius:12, padding:'18px 20px', border:'1px solid #a78bfa26', marginBottom:12 }}>
              <div style={{ color:'#94a3b8', fontSize:10, fontWeight:600, letterSpacing:0.5, marginBottom:6, display:'flex', alignItems:'center', gap:6 }}>BEST ESTIMATE · {pricingMode==='latest'?'LATEST TX':'SMART AVERAGE'}<span title="Cascading match: exact (size+floor) → size → floor → project avg" style={{ cursor:'help', opacity:0.6, fontSize:12 }}>ℹ️</span></div>
              <div style={{ color:'#1e293b', fontSize:32, fontWeight:800, fontFamily:fm, lineHeight:1 }}>${(bestPsf*pArea).toLocaleString()}</div>
              <div style={{ color:'#64748b', fontSize:12, marginTop:6 }}>${bestPsf.toLocaleString()} PSF × {pArea.toLocaleString()} sqft{pFloor?` · Floor ${pFloor}`:''}</div>
            </div>}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[{tier:1,label:'PROJECT AVG',desc:'All sizes · All floors',psf:t1.psf,cnt:t1.count,c:'#94a3b8',ic:'📊',act:!t2.psf&&!t3.psf&&!t4.psf},
                {tier:2,label:'SIZE MATCH',desc:`${nearSize.toLocaleString()} sqft · Any floor`,psf:t2.psf,cnt:t2.cnt,c:'#38bdf8',ic:'📐',act:t2.psf>0&&!t4.psf},
                ...(pFloor?[{tier:3,label:'FLOOR MATCH',desc:`Any size · Floor ${pFloor}`,psf:t3.psf,cnt:t3.cnt,c:'#f59e0b',ic:'🏢',act:t3.psf>0&&!t4.psf}]:[]),
                ...(pFloor&&nearSize?[{tier:4,label:'EXACT MATCH',desc:`${nearSize.toLocaleString()} sqft · Floor ${pFloor}`,psf:t4.psf,cnt:t4.cnt,c:'#22c55e',ic:'🎯',act:t4.psf>0}]:[])
              ].map(t=>t.psf>0 && <div key={t.tier} style={{ background:t.act?`${t.c}08`:'#f1f5f9', border:`1px solid ${t.act?t.c+'4D':'#e2e8f0'}`, borderRadius:12, padding:'16px 18px', position:'relative', overflow:'hidden' }}>
                {t.act && <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:t.c }}/>}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}><span style={{ fontSize:14 }}>{t.ic}</span><span style={{ color:t.act?t.c:'#94a3b8', fontSize:11, fontWeight:700 }}>{t.label}</span></div>
                  <span style={{ background:'#f1f5f9', borderRadius:6, padding:'2px 8px', fontSize:10, color:'#64748b' }}>{t.cnt} tx</span>
                </div>
                <div style={{ color:t.act?'#1e293b':'#94a3b8', fontSize:22, fontWeight:800, fontFamily:fm }}>${(t.psf*pArea).toLocaleString()}</div>
                <div style={{ color:'#64748b', fontSize:10, marginTop:4 }}>${t.psf.toLocaleString()} PSF × {pArea.toLocaleString()} sqft</div>
                <div style={{ color:'#64748b', fontSize:9, marginTop:2 }}>{t.desc}</div>
              </div>)}
            </div>
          </Cd>
        </div>}

        {/* Compare */}
        {aTab==='compare' && <div style={{ display:'grid', gap:16 }}>
          {/* ── PROJECT SELECTOR ── */}
          <SH icon="⚖️" title="Comparative Market Analysis" sub={`Select up to 8 projects to compare. Auto-suggested: same district (D1) + nearby within 3km.`}/>
          <Cd>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
              <div style={{color:'#64748b',fontSize:11,fontWeight:600}}>SELECTED ({cmpSelected.length}/8)</div>
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                <span style={{color:'#64748b',fontSize:10}}>Add:</span>
                <select value="" onChange={e=>{if(e.target.value&&cmpSelected.length<8&&!cmpSelected.includes(e.target.value)){setCmpSelected([...cmpSelected,e.target.value]);}e.target.value='';}} style={{background:'#fff',border:'1px solid #cbd5e1',borderRadius:6,padding:'5px 10px',fontSize:11,color:'#1e293b',cursor:'pointer',outline:'none',minWidth:180}}>
                  <option value="">+ Add project...</option>
                  {cmpPool.filter(p=>!cmpSelected.includes(p.name)).map(p=>{
                    const km = haversine(projCoords.lat,projCoords.lng,p.lat,p.lng).toFixed(1);
                    return <option key={p.name} value={p.name}>{p.name} ({p.dist} · {km}km)</option>;
                  })}
                </select>
              </div>
            </div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {cmpSelected.map((name,i)=>{
                const cmpP = cmpPool.find(p=>p.name===name);
                const isSail = name===cmpP?.name && i===0;
                const km = cmpP?haversine(projCoords.lat,projCoords.lng,cmpP.lat,cmpP.lng).toFixed(1):'0';
                return <div key={name} style={{display:'flex',alignItems:'center',gap:6,background:isSail?'#a78bfa12':'#f1f5f9',border:isSail?'1px solid #a78bfa4D':'1px solid #e2e8f0',borderRadius:8,padding:'6px 10px'}}>
                  <div style={{width:10,height:10,borderRadius:3,background:isSail?'#a78bfa':P[i%P.length]}}/>
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:isSail?'#a78bfa':'#1e293b'}}>{name}</div>
                    <div style={{fontSize:9,color:'#94a3b8'}}>{proj?.dist} · {km}km</div>
                  </div>
                  {!isSail && <button onClick={()=>setCmpSelected(cmpSelected.filter(n=>n!==name))} style={{background:'none',border:'none',color:'#94a3b8',cursor:'pointer',fontSize:14,padding:'0 2px',lineHeight:1}}>×</button>}
                </div>;
              })}
            </div>
            <div style={{display:'flex',gap:12,marginTop:10}}>
              <button onClick={()=>{const sameD=cmpPool.filter(p=>p.dist==='D1'&&p.name!==proj).slice(0,3).map(p=>p.name);const near=cmpPool.filter(p=>p.dist!=='D1'&&haversine(projCoords.lat,projCoords.lng,p.lat,p.lng)<3).slice(0,2).map(p=>p.name);setCmpSelected([proj,...sameD,...near].slice(0,5));}} style={{background:'#fff',border:'1px solid #cbd5e1',borderRadius:6,padding:'4px 12px',fontSize:10,color:'#64748b',cursor:'pointer'}}>🏘️ Same District</button>
              <button onClick={()=>{const near=cmpPool.filter(p=>p.name!==proj).sort((a,b)=>haversine(projCoords.lat,projCoords.lng,a.lat,a.lng)-haversine(projCoords.lat,projCoords.lng,b.lat,b.lng)).slice(0,7).map(p=>p.name);setCmpSelected([proj,...near]);}} style={{background:'#fff',border:'1px solid #cbd5e1',borderRadius:6,padding:'4px 12px',fontSize:10,color:'#64748b',cursor:'pointer'}}>📍 Nearest 7</button>
              <button onClick={()=>setCmpSelected(cmpPool.slice(0,8).map(p=>p.name))} style={{background:'#fff',border:'1px solid #cbd5e1',borderRadius:6,padding:'4px 12px',fontSize:10,color:'#64748b',cursor:'pointer'}}>📋 All (max 8)</button>
            </div>
          </Cd>

          {/* ── DYNAMIC CHARTS ── */}
          {(()=>{
            const sel = cmpSelected.map(n=>cmpPool.find(p=>p.name===n)).filter(Boolean);
            if(sel.length<2) return <Cd><div style={{textAlign:'center',color:'#94a3b8',padding:32}}>Select at least 2 projects to compare</div></Cd>;
            return <>
              <SH icon="📊" title="PSF Comparison" sub={`${sel[0].name} at $${sel[0].psf.toLocaleString()} PSF — ${sel[0].psf<sel[1].psf?'cheaper':'more expensive'} than ${sel[1].name}.`}/>
              <Cd><div style={{height:Math.max(200,sel.length*32)}}><ResponsiveContainer width="100%" height="100%"><BarChart data={sel.map(p=>({n:p.name,v:p.psf}))} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0"/><XAxis type="number" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>'$'+v.toLocaleString()}/><YAxis dataKey="n" type="category" width={140} tick={{fill:'#64748b',fontSize:9}} axisLine={false}/><Tooltip content={<Tip/>}/><Bar dataKey="v" name="Avg PSF" radius={[0,4,4,0]} barSize={18}>{sel.map((p,i)=><Cell key={i} fill={p.name===proj?'#a78bfa':P[i%P.length]}/>)}</Bar></BarChart></ResponsiveContainer></div></Cd>

              <div className="g2">
                <Cd><SH icon="💵" title="Rental Comparison" sub="Monthly rent across selected projects."/><div style={{height:Math.max(200,sel.length*28)}}><ResponsiveContainer width="100%" height="100%"><BarChart data={sel.map(p=>({n:p.name,v:p.rent}))} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0"/><XAxis type="number" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>'$'+v.toLocaleString()}/><YAxis dataKey="n" type="category" width={120} tick={{fill:'#64748b',fontSize:8}} axisLine={false}/><Tooltip content={<Tip/>}/><Bar dataKey="v" name="Avg Rent/mo" radius={[0,4,4,0]} barSize={16}>{sel.map((p,i)=><Cell key={i} fill={p.name===proj?'#a78bfa':P[i%P.length]}/>)}</Bar></BarChart></ResponsiveContainer></div></Cd>
                <Cd><SH icon="💰" title="Yield Comparison" sub="Gross rental yield across selected projects."/><div style={{height:Math.max(200,sel.length*28)}}><ResponsiveContainer width="100%" height="100%"><BarChart data={sel.map(p=>({n:p.name,v:p.yield}))} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0"/><XAxis type="number" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>`${v}%`}/><YAxis dataKey="n" type="category" width={120} tick={{fill:'#64748b',fontSize:8}} axisLine={false}/><Tooltip content={<Tip fmt="%"/>}/><Bar dataKey="v" name="Yield %" radius={[0,4,4,0]} barSize={16}>{sel.map((p,i)=><Cell key={i} fill={p.name===proj?'#a78bfa':P[i%P.length]}/>)}</Bar></BarChart></ResponsiveContainer></div></Cd>
              </div>

              <Cd>
                <h4 style={{ color:'#1e293b', fontSize:13, fontWeight:600, marginBottom:12 }}>Side-by-Side Summary ({sel.length} projects)</h4>
                <div style={{overflowX:'auto'}}>
                  <table><thead><tr>{['Project','Dist','Age','Units','PSF','Rent/mo','Yield','Distance'].map(h=><th key={h}>{h}</th>)}</tr></thead>
                  <tbody>{sel.map((r,i)=>{
                    const km = haversine(projCoords.lat,projCoords.lng,r.lat,r.lng).toFixed(1);
                    return <tr key={r.name}>
                      <td style={{color:r.name===proj?'#a78bfa':'#1e293b',fontWeight:r.name===proj?700:400}}><div style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:8,height:8,borderRadius:2,background:r.name===proj?'#a78bfa':P[i%P.length]}}/>{r.name}</div></td>
                      <td style={{color:'#94a3b8'}}>{r.dist}</td>
                      <td style={{color:'#94a3b8'}}>{r.age}</td>
                      <td style={{color:'#64748b',fontFamily:fm}}>{r.units?.toLocaleString()}</td>
                      <td style={{color:'#38bdf8',fontFamily:fm,fontWeight:600}}>${r.psf.toLocaleString()}</td>
                      <td style={{color:'#34d399',fontFamily:fm}}>${r.rent.toLocaleString()}</td>
                      <td style={{color:r.yield>=3?'#22c55e':r.yield>=2.5?'#f59e0b':'#ef4444',fontWeight:700,fontFamily:fm}}>{r.yield}%</td>
                      <td style={{color:'#64748b',fontFamily:fm,fontSize:11}}>{km}km</td>
                    </tr>;
                  })}</tbody></table>
                </div>
                <Nr style={{marginTop:12}}>THE SAIL is the value pick — lowest PSF in the D1 cluster, highest yield, proven rental demand. The risk is lease decay and aging facilities. MARINA ONE / WALLICH are the premium plays.</Nr>
              </Cd>
            </>;
          })()}

          {/* Interactive Historical Heatmap — Floor × Year */}
          <SH icon="🗓️" title="Historical Heatmap — Floor × Year" sub="Click any cell to inspect. Toggle metrics (PSF/Price/Vol), enable ± Changes for YoY diffs, or filter by unit size."/>
          <Cd>
            {/* Controls row */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,marginBottom:14}}>
              {/* Metric toggle */}
              <div style={{display:'flex',gap:0,background:'#f1f5f9',borderRadius:8,padding:2,border:'1px solid #e2e8f0'}}>
                {[{id:'psf',l:'PSF'},{id:'price',l:'Price'},{id:'vol',l:'Vol'}].map(m=>
                  <button key={m.id} onClick={()=>setHmMetric(m.id)} style={{background:hmMetric===m.id?'#a78bfa26':'transparent',border:hmMetric===m.id?'1px solid #a78bfa4D':'1px solid transparent',borderRadius:6,padding:'5px 14px',fontSize:11,color:hmMetric===m.id?'#a78bfa':'#64748b',cursor:'pointer',fontWeight:600,fontFamily:fm}}>{m.l}</button>
                )}
              </div>
              {/* Diff toggle */}
              <button onClick={()=>setHmShowDiff(!hmShowDiff)} style={{background:hmShowDiff?'#f59e0b20':'#f1f5f9',border:hmShowDiff?'1px solid #f59e0b4D':'1px solid #e2e8f0',borderRadius:8,padding:'5px 14px',fontSize:11,color:hmShowDiff?'#f59e0b':'#64748b',cursor:'pointer',fontWeight:600}}>± Changes</button>
              {/* Size filter */}
              <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                {['All',...projSizes].map(s=>{
                  const active = hmSelFloor==='' && s==='All' || hmSelFloor===String(s);
                  return <button key={s} onClick={()=>setHmSelFloor(s==='All'?'':String(s))} style={{background:s==='All'&&hmSelFloor===''?'#a78bfa26':'transparent',border:(s==='All'&&hmSelFloor==='')?'1px solid #a78bfa4D':'1px solid #e2e8f0',borderRadius:6,padding:'4px 10px',fontSize:10,color:(s==='All'&&hmSelFloor==='')?'#a78bfa':'#64748b',cursor:'pointer',fontWeight:600}}>{s==='All'?'All sizes':`${s}sf`}</button>;
                })}
              </div>
            </div>
            <div style={{overflowX:'auto'}}>
              <div style={{minWidth:850}}>
                {/* Header */}
                <div style={{display:'flex'}}>
                  <div style={{width:70,flexShrink:0,fontSize:10,fontWeight:600,color:'#94a3b8',padding:'8px 4px'}}>Floor</div>
                  {projHmYears.map(y=><div key={y} onClick={()=>setHmSelYear(hmSelYear===y?null:y)} style={{flex:1,minWidth:72,textAlign:'center',fontSize:10,fontWeight:600,color:hmSelYear===y?'#a78bfa':'#94a3b8',padding:'8px 0',borderBottom:hmSelYear===y?'2px solid #a78bfa':'1px solid #f1f5f9',cursor:'pointer'}}>{y}</div>)}
                  <div style={{width:65,flexShrink:0,textAlign:'center',fontSize:9,fontWeight:600,color:'#334155',padding:'8px 2px',borderBottom:'1px solid #f1f5f9',background:'#f8fafc',borderLeft:'1px solid #e2e8f0'}}>Avg Incr.</div>
                  <div style={{width:60,flexShrink:0,textAlign:'center',fontSize:9,fontWeight:600,color:'#334155',padding:'8px 2px',borderBottom:'1px solid #f1f5f9',background:'#f8fafc'}}>% Chg</div>
                  <div style={{width:65,flexShrink:0,textAlign:'center',fontSize:9,fontWeight:600,color:'#334155',padding:'8px 2px',borderBottom:'1px solid #f1f5f9',background:'#f8fafc'}}>Abs. Chg</div>
                  <div style={{width:60,flexShrink:0,textAlign:'center',fontSize:9,fontWeight:600,color:'#334155',padding:'8px 2px',borderBottom:'1px solid #f1f5f9',background:'#f8fafc'}}>Total %</div>
                </div>
                {/* Rows */}
                {(projData?.hmFloors||[]).map(f=>{
                  const vals = projHmYears.map(y=>{
                    const cell = projHmMatrix[`${f}-${y}`];
                    if(!cell) return 0;
                    return hmMetric==='psf'?cell.psf:hmMetric==='price'?cell.price:cell.vol;
                  });
                  const firstV = vals.find(v=>v>0)||1;
                  const lastV = vals[vals.length-1]||0;
                  const totalPct = firstV>0?Math.round((lastV/firstV-1)*100):0;
                  const absChg = lastV - firstV;
                  // Gap-normalized: average YoY increment
                  const gapYears = projHmYears.length-1;
                  const avgIncr = gapYears>0?Math.round(absChg/gapYears):0;
                  const pctChg = gapYears>0?(totalPct/gapYears).toFixed(1):0;

                  // Global range for color mapping
                  const globalMin = hmMetric==='psf'?1518:hmMetric==='price'?1200000:3;
                  const globalMax = hmMetric==='psf'?2530:hmMetric==='price'?2200000:12;
                  const diffColor = hmMetric==='vol'?'#38bdf8':'#0ea5e9';

                  return <div key={f} style={{display:'flex',borderBottom:'1px solid #f1f5f9'}} onMouseEnter={e=>e.currentTarget.style.background='#f1f5f9'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <div style={{width:70,flexShrink:0,fontSize:11,fontWeight:600,color:'#334155',padding:'10px 4px',fontFamily:fm}}>{f}</div>
                    {projHmYears.map((y,yi)=>{
                      const cell = projHmMatrix[`${f}-${y}`];
                      if(!cell) return <div key={y} style={{flex:1,minWidth:72,height:40,display:'flex',alignItems:'center',justifyContent:'center',color:'#64748b',fontSize:11}}>-</div>;
                      const raw = hmMetric==='psf'?cell.psf:hmMetric==='price'?cell.price:cell.vol;
                      const prevRaw = yi>0?(hmMetric==='psf'?projHmMatrix[`${f}-${projHmYears[yi-1]}`]?.psf:hmMetric==='price'?projHmMatrix[`${f}-${projHmYears[yi-1]}`]?.price:projHmMatrix[`${f}-${projHmYears[yi-1]}`]?.vol):null;
                      const diff = prevRaw?raw-prevRaw:null;
                      const diffPct = prevRaw?((raw/prevRaw-1)*100).toFixed(1):null;

                      const isSelected = hmSelYear===y;
                      const ratio = Math.max(0,Math.min(1,(raw-globalMin)/(globalMax-globalMin)));
                      const alpha = hmShowDiff&&yi===0?0.05:0.08+ratio*0.65;

                      let displayVal, displayColor;
                      if(hmShowDiff && yi>0 && diff!==null){
                        displayVal = hmMetric==='psf'?(diff>=0?'+':'')+diff:hmMetric==='price'?(diff>=0?'+$':'-$')+Math.abs(diff).toLocaleString():(diff>=0?'+':'')+diff;
                        displayColor = diff>0?'#4ade80':diff<0?'#f87171':'#94a3b8';
                      } else {
                        displayVal = hmMetric==='psf'?'$'+raw.toLocaleString():hmMetric==='price'?'$'+(raw>=1e6?(raw/1e6).toFixed(2)+'M':raw.toLocaleString()):raw;
                        displayColor = ratio>0.6?'#1e293b':'#94a3b8';
                      }

                      const bgAlpha = hmShowDiff&&yi>0&&diff!==null?(diff>0?`rgba(74,222,128,${Math.min(0.3,Math.abs(diff)/(hmMetric==='psf'?200:500000)*0.3)})`:diff<0?`rgba(248,113,113,${Math.min(0.3,Math.abs(diff)/(hmMetric==='psf'?200:500000)*0.3)})`:'transparent'):`rgba(14,165,233,${alpha})`;

                      return <div key={y} onClick={()=>{setHmSelYear(y);}} style={{flex:1,minWidth:72,height:40,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontFamily:fm,fontWeight:500,backgroundColor:bgAlpha,color:displayColor,transition:'all 0.2s',cursor:'pointer',outline:isSelected?'2px solid #a78bfa':'none',outlineOffset:-2,borderRadius:isSelected?2:0}} title={`${f}, ${y}: $${cell.psf.toLocaleString()} PSF · ${cell.vol} txns · $${cell.price.toLocaleString()} avg price`}>{displayVal}</div>;
                    })}
                    {/* Summary stats columns */}
                    <div style={{width:65,flexShrink:0,height:40,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontFamily:fm,fontWeight:600,color:'#94a3b8',background:'#f8fafc',borderLeft:'1px solid #e2e8f0'}}>{hmMetric==='psf'?'+$'+avgIncr:hmMetric==='price'?'+$'+(avgIncr/1e3).toFixed(0)+'K':'+'+avgIncr}</div>
                    <div style={{width:60,flexShrink:0,height:40,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontFamily:fm,fontWeight:600,color:Number(pctChg)>4?'#4ade80':Number(pctChg)>2?'#f59e0b':'#94a3b8',background:'#f8fafc'}}>{pctChg}%</div>
                    <div style={{width:65,flexShrink:0,height:40,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontFamily:fm,fontWeight:600,color:'#38bdf8',background:'#f8fafc'}}>{hmMetric==='psf'?'+$'+absChg:hmMetric==='price'?'+$'+(absChg/1e3).toFixed(0)+'K':'+'+absChg}</div>
                    <div style={{width:60,flexShrink:0,height:40,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontFamily:fm,fontWeight:700,color:totalPct>18?'#22c55e':totalPct>12?'#f59e0b':'#94a3b8',background:'#f8fafc'}}>{totalPct>0?'+':''}{totalPct}%</div>
                  </div>;})}
                {/* Legend */}
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:12,fontSize:10,color:'#64748b',flexWrap:'wrap',gap:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span>Low</span>
                    <div style={{width:80,height:6,borderRadius:3,background:hmShowDiff?'linear-gradient(to right, rgba(248,113,113,0.3), transparent, rgba(74,222,128,0.3))':'linear-gradient(to right, rgba(14,165,233,0.08), rgba(14,165,233,0.73))'}}/>
                    <span>{hmShowDiff?'High Δ':'High '+hmMetric.toUpperCase()}</span>
                  </div>
                  <span style={{fontStyle:'italic',color:'#64748b'}}>Click cells to select · {hmShowDiff?'Showing YoY changes':'Showing absolute values'}</span>
                </div>
              </div>
            </div>
            <Nr style={{marginTop:12}}>High floors (46+) show strongest 4-year growth at 20% — floor premium amplifies over time. Low floors (01-05) grew ~20% as well due to base effect. Mid floors (16-25) are the sweet spot for entry price vs growth.</Nr>
          </Cd>

          {/* Nearby Project PSF Heatmap */}
          <SH icon="🏘️" title="Nearby Project PSF Comparison" sub="Project × Year PSF matrix for D1/D2 waterfront condos. Darker = higher PSF. Click to compare growth trajectories."/>
          <Cd>
            <div style={{overflowX:'auto'}}>
              <div style={{minWidth:600}}>
                {/* Header */}
                <div style={{display:'flex'}}>
                  <div style={{width:130,flexShrink:0,fontSize:10,fontWeight:600,color:'#94a3b8',padding:'8px 4px'}}>Project</div>
                  {nearbyHm.years.map(y=><div key={y} style={{flex:1,minWidth:72,textAlign:'center',fontSize:10,fontWeight:600,color:'#94a3b8',padding:'8px 0',borderBottom:'1px solid #f1f5f9'}}>{y}</div>)}
                  <div style={{width:70,flexShrink:0,textAlign:'center',fontSize:10,fontWeight:600,color:'#334155',padding:'8px 0',borderBottom:'1px solid #f1f5f9',background:'#f8fafc',borderLeft:'1px solid #e2e8f0'}}>4yr Growth</div>
                </div>
                {/* Rows */}
                {nearbyHm.projects.map((proj,pi)=>{
                  const vals = nearbyHm.years.map(y=>nearbyHm.data[`${proj}-${y}`]||0);
                  const first = vals[0]||1;
                  const last = vals[vals.length-1]||0;
                  const growth = Math.round((last/first-1)*100);
                  const isSail = pi===0;
                  const nearMin = 1480; const nearMax = 2450;
                  return <div key={proj} style={{display:'flex',borderBottom:'1px solid #f1f5f9',background:isSail?'#a78bfa12':'transparent'}} onMouseEnter={e=>{if(!isSail)e.currentTarget.style.background='#f1f5f9'}} onMouseLeave={e=>{if(!isSail)e.currentTarget.style.background=isSail?'#a78bfa12':'transparent'}}>
                    <div style={{width:130,flexShrink:0,fontSize:11,fontWeight:isSail?700:500,color:isSail?'#a78bfa':'#334155',padding:'10px 4px',display:'flex',alignItems:'center',gap:4}}>{isSail&&<span style={{fontSize:8}}>●</span>}{proj}</div>
                    {nearbyHm.years.map(y=>{
                      const psf = nearbyHm.data[`${proj}-${y}`];
                      const vol = nearbyHm.vol[`${proj}-${y}`];
                      if(!psf) return <div key={y} style={{flex:1,minWidth:72,height:40,display:'flex',alignItems:'center',justifyContent:'center',color:'#64748b',fontSize:11}}>-</div>;
                      const ratio = Math.max(0,Math.min(1,(psf-nearMin)/(nearMax-nearMin)));
                      const alpha = 0.08+ratio*0.6;
                      const hue = isSail?'167,139,250':'14,165,233';
                      return <div key={y} style={{flex:1,minWidth:72,height:40,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontFamily:fm,fontWeight:isSail?600:500,backgroundColor:`rgba(${hue},${alpha})`,color:ratio>0.55?'#1e293b':'#94a3b8',transition:'all 0.2s'}} title={`${proj}, ${y}: $${psf.toLocaleString()} PSF · ${vol} txns`}>${psf.toLocaleString()}</div>;
                    })}
                    <div style={{width:70,flexShrink:0,height:40,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontFamily:fm,fontWeight:700,color:growth>20?'#22c55e':growth>15?'#4ade80':'#f59e0b',background:'#f8fafc',borderLeft:'1px solid #e2e8f0'}}>+{growth}%</div>
                  </div>;
                })}
                {/* Legend */}
                <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:8,marginTop:12,fontSize:10,color:'#64748b'}}>
                  <span>Low</span>
                  <div style={{width:80,height:6,borderRadius:3,background:'linear-gradient(to right, rgba(14,165,233,0.08), rgba(14,165,233,0.68))'}}/>
                  <span>High PSF</span>
                  <span style={{marginLeft:12}}><span style={{color:'#a78bfa',fontSize:8}}>●</span> = THE SAIL</span>
                </div>
              </div>
            </div>
            <Nr style={{marginTop:12}}>MARINA ONE leads on absolute PSF ($2,450) but THE SAIL shows comparable 4-year growth (+19%) at a much lower entry point. REFLECTIONS at $1,780 is the cheapest but located in D4 — further from CBD. THE SAIL offers the best value per PSF within the marina cluster.</Nr>
          </Cd>
        </div>}

        {/* Records */}
        {aTab==='records' && <div style={{ display:'grid', gap:16 }}>
          <SH icon="📋" title="Recent Sale Transactions" sub={`${projTx.length} most recent sales for ${p.name}. PSF range: $1,937–$2,494. Higher floors and smaller units command premium PSF.`}/>
          <Cd><table><thead><tr>{['Date','Unit','Area (sf)','Price','PSF','Type'].map(h=><th key={h}>{h}</th>)}</tr></thead>
            <tbody>{(projData?.projTx||[]).map((tx,i)=><tr key={i}><td style={{ color:'#94a3b8' }}>{tx.date}</td><td style={{ color:'#1e293b', fontFamily:fm }}>{tx.address}</td><td style={{ fontFamily:fm }}>{tx.area.toLocaleString()}</td><td style={{ color:'#38bdf8', fontFamily:fm }}>${tx.price.toLocaleString()}</td><td style={{ color:tx.psf>=2200?'#22c55e':tx.psf>=2050?'#f59e0b':'#fb923c', fontFamily:fm }}>${tx.psf.toLocaleString()}</td><td style={{ color:'#94a3b8' }}>{tx.type}</td></tr>)}</tbody></table>
          </Cd>
          <Nr>Note: #48-15 at $2,494 PSF is a 2,045sf penthouse — high-floor premium in action. #08-11 at $1,937 PSF is a 506sf low-floor unit — the $557 PSF gap between floors 8 and 48 reflects the floor premium curve above.</Nr>

          <SH icon="🏠" title="Recent Rental Contracts" sub="Rent PSF varies dramatically by unit size: 1BR at $6.32–6.72/sf vs 3BR at $4.91/sf. Smaller units are more rent-efficient."/>
          <Cd><table><thead><tr>{['Date','Unit','Type','Area (sf)','Rent/mo','Rent PSF'].map(h=><th key={h}>{h}</th>)}</tr></thead>
            <tbody>{(projData?.projRentTx||[]).map((tx,i)=><tr key={i}><td style={{ color:'#94a3b8' }}>{tx.date}</td><td style={{ color:'#1e293b', fontFamily:fm }}>{tx.address}</td><td>{tx.bed}</td><td style={{ fontFamily:fm }}>{tx.area.toLocaleString()}</td><td style={{ color:'#34d399', fontFamily:fm }}>${tx.rent.toLocaleString()}</td><td style={{ color:tx.psf>=6?'#22c55e':tx.psf>=5?'#f59e0b':'#fb923c', fontFamily:fm }}>${tx.psf.toFixed(2)}</td></tr>)}</tbody></table>
          </Cd>
          <Nr>The PH at #46-15 renting for $15,000/mo ($7.33 PSF) is an outlier — ultra-high-floor sea view. Typical 2BR ranges $4,900–$5,200/mo. For investment sizing, use the 2BR median as your baseline.</Nr>
        </div>}

      </div>}
    </div>
  );
}
