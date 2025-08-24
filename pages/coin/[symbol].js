// pages/coin/[symbol].js
import { useEffect, useState } from "react";
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
const clamp = (x,min,max)=> Math.max(min, Math.min(max,x));

function rsiInfo(r){
  if (r==null) return "—";
  if (r>=70) return "Aşırı Alım";
  if (r<=30) return "Aşırı Satım";
  return "Nötr";
}
function biasFromLatest(L){
  if(!L) return { longPct:50, shortPct:50, score:0 };
  const close=L.close, ema=L.ema20, rsi=L.rsi14, k=L.stochK, d=L.stochD, bu=L.bbUpper, bl=L.bbLower;
  const emaDist = (close!=null && ema!=null) ? ((close-ema)/ema*100) : null;
  const kCross  = (k!=null && d!=null) ? (k-d) : null;
  const bandPos = (bu!=null && bl!=null && close!=null) ? ((close-bl)/(bu-bl)*100) : null;
  const nEMA   = emaDist==null ? 0 : clamp(emaDist/3, -1, 1);
  const nRSI   = rsi==null ? 0 : clamp((rsi-50)/25, -1, 1);
  const nKxD   = kCross==null ? 0 : clamp(kCross/50, -1, 1);
  const nBand  = bandPos==null ? 0 : clamp((bandPos-50)/30, -1, 1);
  const wEMA=0.35, wRSI=0.30, wKxD=0.20, wBand=0.15;
  const score = (wEMA*nEMA + wRSI*nRSI + wKxD*nKxD + wBand*nBand);
  const longPct = Math.round( (score+1)/2 * 100 );
  const shortPct = 100 - longPct;
  return { longPct, shortPct, score };
}

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

  const { longPct, shortPct } = biasFromLatest(L);
  const biasSignal = longPct>=55 ? "AL" : shortPct>=55 ? "SAT" : "NÖTR";
  const color  = biasSignal==="AL" ? "#20c997" : biasSignal==="SAT" ? "#ff6b6b" : "#89a";

  let entry = L.close, stop = null, tp1=null, tp2=null, tp3=null;
  if (biasSignal==="AL" && L.bbLower!=null) {
    const R = entry - L.bbLower; stop = L.bbLower; tp1 = entry + R; tp2 = entry + 2*R; tp3 = entry + 3*R;
  } else if (biasSignal==="SAT" && L.bbUpper!=null) {
    const R = L.bbUpper - entry; stop = L.bbUpper; tp1 = entry - R; tp2 = entry - 2*R; tp3 = entry - 3*R;
  }

  return (
    <main style={{padding:"24px"}}>
      <div style={{marginBottom:12}}>
        <Link href="/" legacyBehavior><a style={{color:"#8bd4ff"}}>← Ana Sayfa</a></Link>
      </div>

      <div style={{display:"flex", gap:12, alignItems:"center"}}>
        <h1 style={{color:"#8bd4ff", margin:0}}>{symbol}</h1>
        <select value={iv} onChange={e=>setIv(e.target.value)}
          style={{padding:"6px 10px", background:"#121625", border:"1px solid #23283b", borderRadius:10, color:"#e6e6e6"}}>
          {["1m","5m","15m","1h","4h"].map(x=><option key={x} value={x}>{x}</option>)}
        </select>
        <span style={{marginLeft:"auto", fontWeight:800, color}}>
          {biasSignal} • Long {longPct}% / Short {shortPct}%
        </span>
      </div>

      {loading && <div>Yükleniyor…</div>}
      {err && <div style={{color:"red"}}>{err}</div>}

      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:12, marginTop:20}}>
        <Box label="Son Kapanış" val={fmtPrice(L.close)} />
        <Box label="EMA20" val={`${fmtPrice(L.ema20)} • ${pct(emaDist)}`} />
        <Box label="RSI(14)" val={fmt(L.rsi14,2)} />
        <Box label="Stoch %K" val={fmt(L.stochK,2)} />
        <Box label="Stoch %D" val={fmt(L.stochD,2)} />
        <Box label="Bollinger Üst" val={fmtPrice(L.bbUpper)} />
        <Box label="Bollinger Alt" val={fmtPrice(L.bbLower)} />
        <Box label="Bant Konumu" val={pct(bandPos)} />
        <Box label="Long %" val={`${fmt(longPct,0)}%`} />
        <Box label="Short %" val={`${fmt(shortPct,0)}%`} />
      </div>

      <section style={{marginTop:30}}>
        <h2>AI Trade Plan (beta)</h2>
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:12}}>
          <Box label="Yön" val={biasSignal} />
          <Box label="Entry" val={fmtPrice(entry)} />
          <Box label="Stop Loss" val={fmtPrice(stop)} />
          <Box label="TP1" val={fmtPrice(tp1)} />
          <Box label="TP2" val={fmtPrice(tp2)} />
          <Box label="TP3" val={fmtPrice(tp3)} />
        </div>
      </section>
    </main>
  );
}

function Box({ label, val, sub, color }) {
  return (
    <div style={{background:"#151a2b", border:"1px solid #26304a", borderRadius:12, padding:14}}>
      <div style={{opacity:.8, marginBottom:4}}>{label}</div>
      <div style={{fontWeight:800, fontSize:18, color:color||"#fff"}}>{val??"—"}</div>
      {sub && <div style={{opacity:.6, fontSize:12}}>{sub}</div>}
    </div>
  );
}

export async function getServerSideProps({ params }) {
  return { props: { symbolInit: params.symbol.toUpperCase() } };
}


