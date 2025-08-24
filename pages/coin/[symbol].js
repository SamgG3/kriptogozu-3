// Coin detay: /coin/BTCUSDT gibi
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const INTERVALS = ["1m", "5m", "15m", "1h", "4h"];
const fmt = (n,d=2)=> (n==null||isNaN(n))?"—":Number(n).toLocaleString("tr-TR",{minimumFractionDigits:d,maximumFractionDigits:d});
const pct = (n,d=2)=> (n==null||isNaN(n))?"—":(n>=0?"+":"")+Number(n).toFixed(d)+"%";

export default function CoinPage({ symbolInit }) {
  const [symbol, setSymbol] = useState(symbolInit || "BTCUSDT");
  const [iv, setIv] = useState("1m");
  const [latest, setLatest] = useState(null);
  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const [err, setErr] = useState(null);
  const timer = useRef(null);

  async function load(){
    try{
      setLoading(true); setErr(null);
      const r = await fetch(`/api/futures/indicators?symbol=${encodeURIComponent(symbol)}&interval=${iv}&limit=300&series=1`, { cache:"no-store" });
      const j = await r.json();
      setLatest(j.latest || null);
      setSeries(j.series || null);
    }catch(e){ setErr(String(e)); }
    finally{ setLoading(false); }
  }
  useEffect(()=>{ load(); }, [symbol, iv]);
  useEffect(()=>{
    if (timer.current) clearInterval(timer.current);
    if (auto) timer.current = window.setInterval(load, 10000);
    return ()=> { if (timer.current) clearInterval(timer.current); };
  }, [auto, symbol, iv]);

  const c  = latest?.close, e20 = latest?.ema20, r14 = latest?.rsi14;
  const bu = latest?.bbUpper, bl = latest?.bbLower, k = latest?.stochK, d = latest?.stochD;

  const bandPosPct   = (bu!=null&&bl!=null&&c!=null)?((c-bl)/(bu-bl)*100):null;
  const bandWidthPct = (bu!=null&&bl!=null&&c!=null)?((bu-bl)/c*100):null;

  const rsiLabel   = r14==null ? "—" : r14>=70 ? "Aşırı Alım" : r14<=30 ? "Aşırı Satım" : "Nötr";
  const stochLabel = (k!=null&&d!=null)?(k>d?"K>%D (yukarı)":"K<%D (aşağı)"):"—";

  // AI Trade Plan (ilk sürüm): entry=close, stop=BB Alt, TP'ler 1R/2R/3R
  const entryAI = c ?? null;
  const stopAI  = (bl!=null && c!=null && bl < c) ? bl : (c!=null ? c*0.997 : null);
  const R = (entryAI!=null && stopAI!=null) ? (entryAI - stopAI) : null;
  const tp1AI = (R!=null) ? entryAI + 1*R : null;
  const tp2AI = (R!=null) ? entryAI + 2*R : null;
  const tp3AI = (R!=null) ? entryAI + 3*R : null;
  const rrHint = R!=null ? `R: ${fmt(R,2)} • RR: 1R/2R/3R` : "—";

  const tvUrl = `https://www.tradingview.com/chart/?symbol=BINANCE:${encodeURIComponent(symbol)}`;

  return (
    <main style={{minHeight:"100vh", background:"#0f1115", color:"#e6e6e6", fontFamily:"system-ui"}}>
      <nav style={{display:"flex", alignItems:"center", gap:16, padding:"16px 24px", borderBottom:"1px solid #23283b"}}>
        <Link href="/" style={{color:"#8bd4ff", fontWeight:700}}>Ana Sayfa</Link>
        <span style={{opacity:.7}}>›</span>
        <span style={{color:"#59c1ff", fontWeight:800}}>{symbol}</span>
        <a href={tvUrl} target="_blank" rel="noreferrer" style={{marginLeft:"auto", color:"#8bd4ff"}}>TradingView’da aç →</a>
      </nav>

      <div style={{display:"flex", gap:12, flexWrap:"wrap", padding:"16px 24px"}}>
        <input value={symbol} onChange={e=>setSymbol(e.target.value.toUpperCase())}
          placeholder="BTCUSDT"
          style={{padding:"10px 12px", background:"#121625", border:"1px solid #23283b", borderRadius:10, color:"#e6e6e6"}} />
        <select value={iv} onChange={e=>setIv(e.target.value)}
          style={{padding:"10px 12px", background:"#121625", border:"1px solid #23283b", borderRadius:10, color:"#e6e6e6"}}>
          {INTERVALS.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <button onClick={load} disabled={loading}
          style={{padding:"10px 14px", background:"#1a1f2e", border:"1px solid #2a2f45", borderRadius:10, color:"#fff", fontWeight:700, cursor:"pointer"}}>
          {loading ? "Yükleniyor..." : "Yenile"}
        </button>
        <label style={{display:"flex", alignItems:"center", gap:8}}>
          <input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/> 10 sn’de bir otomatik yenile
        </label>
      </div>

      {err && <div style={{color:"#ffb4b4", padding:"0 24px 8px"}}>Hata: {err}</div>}

      <section style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:12, padding:"0 24px 24px"}}>
        <Card title={`${symbol} (${iv})`} value={fmt(c)} sub="Son Kapanış"/>
        <Card title="EMA20" value={fmt(e20)} sub={`Fiyat/EMA: ${pct((c!=null && e20!=null)?((c-e20)/e20*100):null)}`}/>
        <Card title="RSI(14)" value={fmt(r14)} sub={rsiLabel}/>
        <Card title="StochRSI %K" value={fmt(k)} sub={stochLabel}/>
        <Card title="StochRSI %D" value={fmt(d)} sub="3-periyot SMA"/>
        <Card title="Bollinger Üst" value={fmt(bu)} sub={`Bant gen.: ${pct(bandWidthPct)}`}/>
        <Card title="Bollinger Alt" value={fmt(bl)} sub={`Banttaki konum: ${pct(bandPosPct)}`}/>
      </section>

      <section style={{padding:"0 24px 24px"}}>
        <div style={{background:"#151a2b", border:"1px solid #26304a", borderRadius:12, padding:14}}>
          <div style={{opacity:.8, marginBottom:6}}>Mini Grafik (son ~120 bar)</div>
          <MiniChart series={series}/>
        </div>
      </section>

      <section style={{padding:"0 24px 48px"}}>
        <h3>AI Trade Plan (beta)</h3>
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:12}}>
          <Card title="Entry" value={fmt(entryAI)} sub="Öneri: anlık fiyat"/>
          <Card title="Stop Loss" value={fmt(stopAI)} sub="Öneri: Bollinger Alt (yakın)"/>
          <Card title="TP1" value={fmt(tp1AI)} sub="≈ 1R"/>
          <Card title="TP2" value={fmt(tp2AI)} sub="≈ 2R"/>
          <Card title="TP3" value={fmt(tp3AI)} sub="≈ 3R"/>
          <Card title="Plan Özeti" value={rrHint} sub="Deneme — geliştirilecek"/>
        </div>
      </section>
    </main>
  );
}

export function getServerSideProps({ params }) {
  return { props: { symbolInit: params.symbol?.toUpperCase() || null } };
}

function Card({ title, value, sub }) {
  return (
    <div style={{ background:"#151a2b", border:"1px solid #26304a", borderRadius:12, padding:14 }}>
      <div style={{opacity:.8, marginBottom:6}}>{title}</div>
      <div style={{fontSize:24, fontWeight:800}}>{value}</div>
      <div style={{fontSize:12, opacity:.7, marginTop:6}}>{sub}</div>
    </div>
  );
}
function MiniChart({ series }) {
  if (!series) return <div>Yükleniyor…</div>;
  const { closes, ema20, bbUpper, bbLower } = series;
  const W = 920, H = 220, P = 12;
  const vals = [...closes, ...ema20.filter(Boolean), ...bbUpper.filter(Boolean), ...bbLower.filter(Boolean)];
  const min = Math.min(...vals), max = Math.max(...vals);
  const x = (i)=> P + i * ((W - 2*P) / (closes.length - 1));
  const y = (v)=> H - P - ((v - min) / (max - min)) * (H - 2*P);
  const path = (arr)=> arr.map((v,i)=> v==null?null:`${i===0?"M":"L"} ${x(i)} ${y(v)}`).filter(Boolean).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      <path d={path(bbUpper)} stroke="#5a6b9a" fill="none" strokeWidth="1.2"/>
      <path d={path(bbLower)} stroke="#5a6b9a" fill="none" strokeWidth="1.2"/>
      <path d={path(ema20)}  stroke="#f2c94c" fill="none" strokeWidth="1.5"/>
      <path d={path(closes)} stroke="#20b7ff" fill="none" strokeWidth="1.3"/>
    </svg>
  );
}

