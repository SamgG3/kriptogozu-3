import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const DEFAULTS = ["BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","ADAUSDT","DOGEUSDT"];

const fmtPrice = (v)=>{
  if (v==null || isNaN(v)) return "—";
  const a = Math.abs(v);
  const d = a >= 100 ? 2 : a >= 1 ? 4 : 6; // büyük fiyat 2, orta 4, küçük 6 hane
  return Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d, maximumFractionDigits:d});
};
const fmt = (v,d=2)=> (v==null||isNaN(v)) ? "—" :
  Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d, maximumFractionDigits:d});
const pct = (v,d=2)=> (v==null||isNaN(v)) ? "—" :
  (v>=0?"+":"")+Number(v).toFixed(d)+"%";

export default function Home() {
  const [symbols, setSymbols] = useState(DEFAULTS);
  const [interval, setIntervalStr] = useState("1m");
  const [rows, setRows] = useState({}); // {SYM: json}
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const timer = useRef(null);

  async function load() {
    try {
      setLoading(true);
      const res = await Promise.all(
        symbols.map(sym =>
          fetch(`/api/futures/indicators?symbol=${sym}&interval=${interval}&limit=300`, { cache:"no-store" })
            .then(r=>r.json())
            .catch(()=>null)
        )
      );
      const map = {};
      symbols.forEach((sym, i)=> map[sym] = res[i]);
      setRows(map);
    } finally { setLoading(false); }
  }

  useEffect(()=>{ load(); }, [interval, symbols]);
  useEffect(()=>{
    if (timer.current) clearInterval(timer.current);
    if (auto) timer.current = setInterval(load, 10000);
    return ()=> clearInterval(timer.current);
  }, [auto, interval, symbols]);

  return (
    <main style={{padding:"16px 18px"}}>
      {/* üst kontrol barı */}
      <div style={{display:"flex", gap:12, alignItems:"center", marginBottom:12}}>
        <h1 style={{margin:0, fontSize:20}}>KriptoGözÜ • Genel Panel</h1>
        <span style={{opacity:.7}}>({interval})</span>
        <select value={interval} onChange={e=>setIntervalStr(e.target.value)}
          style={{padding:"8px 10px", background:"#121625", border:"1px solid #23283b", borderRadius:10, color:"#e6e6e6"}}>
          {["1m","5m","15m","1h","4h"].map(x=><option key={x} value={x}>{x}</option>)}
        </select>
        <button onClick={load} disabled={loading}
          style={{padding:"8px 12px", background:"#1a1f2e", border:"1px solid #2a2f45", borderRadius:10, color:"#fff", fontWeight:700}}>
          {loading? "Yükleniyor…" : "Yenile"}
        </button>
        <label style={{marginLeft:8, display:"flex", alignItems:"center", gap:8}}>
          <input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/>
          10 sn’de bir otomatik yenile
        </label>
      </div>

      {/* coin grid */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))", gap:12}}>
        {symbols.map(sym => <CoinCard key={sym} sym={sym} row={rows[sym]} />)}
      </div>
    </main>
  );
}

function CoinCard({ sym, row }) {
  const L = row?.latest || {};
  const close = L.close, ema20 = L.ema20, rsi = L.rsi14, k = L.stochK, d = L.stochD, bu = L.bbUpper, bl = L.bbLower;

  const emaDist = (close!=null && ema20!=null) ? ((close-ema20)/ema20*100) : null;
  const bandPos = (bu!=null && bl!=null && close!=null) ? ((close-bl)/(bu-bl)*100) : null;
  const kCross  = (k!=null && d!=null) ? (k-d) : null;

  // Basit AI sinyal skoru (sonra kuralları derinleştiririz)
  const score =
    (emaDist!=null ? (emaDist>0 ? 1 : -1) : 0) +
    (rsi!=null ? (rsi>55 ? 1 : rsi<45 ? -1 : 0) : 0) +
    (kCross!=null ? (kCross>0 ? 1 : -1) : 0);
  const signal = score >= 2 ? "AL" : score <= -2 ? "SAT" : "NÖTR";
  const color  = signal==="AL" ? "#20c997" : signal==="SAT" ? "#ff6b6b" : "#89a";
  const border = signal==="AL" ? "#1f7a4f" : signal==="SAT" ? "#7a2e2e" : "#2a2f45";

  return (
    <Link href={`/coin/${sym}`} style={{textDecoration:"none"}}>
      <div style={{background:"#151a2b", border:`1px solid ${border}`, borderRadius:12, padding:14}}>
        {/* üst başlık */}
        <div style={{display:"flex", gap:12, alignItems:"baseline", marginBottom:8}}>
          <div style={{fontWeight:800, fontSize:18, color:"#8bd4ff"}}>{sym}</div>
          <span style={{opacity:.8}}>Son: <b>{fmtPrice(close)}</b></span>
          <span style={{marginLeft:"auto", fontWeight:800, color:color}}>AI: {signal}</span>
        </div>

        {/* indikatör sayıları (grafik yok) */}
        <div style={{display:"grid", gridTemplateColumns:"repeat(2, minmax(0, 1fr))", gap:8}}>
          <Row label="EMA20"   val={`${fmtPrice(ema20)}  •  Fiyat/EMA: ${pct(emaDist)}`} />
          <Row label="RSI(14)" val={`${fmt(rsi,2)}  (${rsiInfo(rsi)})`} />
          <Row label="Stoch %K" val={fmt(k,2)} />
          <Row label="Stoch %D" val={fmt(d,2)} />
          <Row label="BB Üst"  val={fmtPrice(bu)} />
          <Row label="BB Alt"  val={fmtPrice(bl)} />
          <Row label="Bant Konumu" val={pct(bandPos)} />
        </div>

        <div style={{opacity:.7, fontSize:12, marginTop:10}}>Tıkla → detay & AI trade plan</div>
      </div>
    </Link>
  );
}

function Row({ label, val }) {
  return (
    <div style={{display:"flex", gap:8, alignItems:"center", background:"#0f1424",
      border:"1px solid #26304a", borderRadius:8, padding:"6px 8px"}}>
      <span style={{opacity:.8, minWidth:100}}>{label}</span>
      <strong>{val}</strong>
    </div>
  );
}

function rsiInfo(r){
  if (r==null) return "—";
  if (r>=70) return "Aşırı Alım";
  if (r<=30) return "Aşırı Satım";
  return "Nötr";
}
