import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const fmtPrice = (v)=>{
  if (v==null || isNaN(v)) return "—";
  const a = Math.abs(v);
  const d = a >= 100 ? 2 : a >= 1 ? 4 : 6;
  return Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d, maximumFractionDigits:d});
};
const fmt = (v,d=2)=> (v==null||isNaN(v)) ? "—" :
  Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d, maximumFractionDigits:d});
const pct = (v,d=2)=> (v==null||isNaN(v)) ? "—" :
  (v>=0?"+":"")+Number(v).toFixed(d)+"%";

export default function CoinPage({ symbolInit }) {
  const [symbol, setSymbol] = useState(symbolInit || "BTCUSDT");
  const [iv, setIv] = useState("1m");
  const [latest, setLatest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function load() {
    try {
      setLoading(true);
      setErr(null);
      const r = await fetch(`/api/futures/indicators?symbol=${symbol}&interval=${iv}&limit=300&series=1`, { cache:"no-store" });
      const j = await r.json();
      setLatest(j.latest || null);
    } catch(e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(()=>{ load(); }, [symbol, iv]);

  const L = latest || {};
  const emaDist = (L.close!=null && L.ema20!=null) ? ((L.close-L.ema20)/L.ema20*100) : null;
  const bandPos = (L.bbUpper!=null && L.bbLower!=null && L.close!=null) ? ((L.close-L.bbLower)/(L.bbUpper-L.bbLower)*100) : null;
  const kCross  = (L.stochK!=null && L.stochD!=null) ? (L.stochK-L.stochD) : null;

  const score =
    (emaDist!=null ? (emaDist>0 ? 1 : -1) : 0) +
    (L.rsi14!=null ? (L.rsi14>55 ? 1 : L.rsi14<45 ? -1 : 0) : 0) +
    (kCross!=null ? (kCross>0 ? 1 : -1) : 0);
  const signal = score >= 2 ? "AL" : score <= -2 ? "SAT" : "NÖTR";
  const color  = signal==="AL" ? "#20c997" : signal==="SAT" ? "#ff6b6b" : "#89a";

  return (
    <main style={{padding:"24px"}}>
      <div style={{marginBottom:12}}>
        <Link href="/" style={{color:"#8bd4ff"}}>← Ana Sayfa</Link>
      </div>

      <h1 style={{color:"#8bd4ff"}}>{symbol} ({iv})</h1>
      {loading && <div>Yükleniyor…</div>}
      {err && <div style={{color:"red"}}>{err}</div>}

      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:12, marginTop:20}}>
        <Box label="Son Kapanış" val={fmtPrice(L.close)} />
        <Box label="EMA20" val={`${fmtPrice(L.ema20)} • ${pct(emaDist)}`} />
        <Box label="RSI(14)" val={`${fmt(L.rsi14,2)} (${rsiInfo(L.rsi14)})`} />
        <Box label="Stoch %K" val={fmt(L.stochK,2)} />
        <Box label="Stoch %D" val={fmt(L.stochD,2)} />
        <Box label="Bollinger Üst" val={fmtPrice(L.bbUpper)} />
        <Box label="Bollinger Alt" val={fmtPrice(L.bbLower)} />
        <Box label="Bant Konumu" val={pct(bandPos)} />
        <Box label="AI Sinyali" val={signal} color={color} />
      </div>

      {/* Trade Plan */}
      <section style={{marginTop:30}}>
        <h2>AI Trade Plan (beta)</h2>
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:12}}>
          <Box label="Entry" val={fmtPrice(L.close)} />
          <Box label="Stop Loss" val={fmtPrice(L.bbLower)} sub="Öneri: Bollinger Alt (yakın)" />
          <Box label="TP1" val={fmtPrice(L.close*1.0038)} sub="≈ 1R" />
          <Box label="TP2" val={fmtPrice(L.close*1.0078)} sub="≈ 2R" />
          <Box label="TP3" val={fmtPrice(L.close*1.0118)} sub="≈ 3R" />
          <Box label="Plan Özeti" val="Deneme → geliştirilecek" sub="R: 1R/2R/3R" />
        </div>
      </section>
    </main>
  );
}

function Box({ label, val, sub, color }) {
  return (
    <div style={{background:"#151a2b", border:"1px solid #26304a", borderRadius:12, padding:14}}>
      <div style={{opacity:.8, marginBottom:4}}>{label}</div>
      <div style={{fontWeight:800, fontSize:18, color:color||"#fff"}}>{val}</div>
      {sub && <div style={{opacity:.6, fontSize:12}}>{sub}</div>}
    </div>
  );
}

function rsiInfo(r){
  if (r==null) return "—";
  if (r>=70) return "Aşırı Alım";
  if (r<=30) return "Aşırı Satım";
  return "Nötr";
}

export async function getServerSideProps({ params }) {
  return { props: { symbolInit: params.symbol.toUpperCase() } };
}
