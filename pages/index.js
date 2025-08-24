// Ana sayfa: coin listesi + indikatör özetleri + tıkla → /coin/[symbol]
import { useEffect, useState, useRef } from "react";
import Link from "next/link";

const SYMBOLS = ["BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","ADAUSDT","DOGEUSDT"];
const INTERVAL = "1m";           // ana sayfada sabit aralık (istersen dropdown’a çevirebiliriz)
const REFRESH_MS = 10000;        // 10 sn otomatik yenile

const fmt  = (n,d=2)=> (n==null||isNaN(n))?"—":Number(n).toLocaleString("tr-TR",{minimumFractionDigits:d,maximumFractionDigits:d});
const pct  = (n,d=2)=> (n==null||isNaN(n))?"—":(n>=0?"+":"")+Number(n).toFixed(d)+"%";
const sign = (v)=> v==null?"—":(v>0?"+":"") + v.toFixed(2);

export default function Home() {
  const [data, setData] = useState({});     // { BTCUSDT: {latest:{...}} }
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  async function load() {
    try {
      setLoading(true);
      const results = await Promise.all(
        SYMBOLS.map(sym =>
          fetch(`/api/futures/indicators?symbol=${sym}&interval=${INTERVAL}&limit=300`, { cache:"no-store" })
            .then(r => r.json())
            .then(j => [sym, j])
            .catch(() => [sym, null])
        )
      );
      const map = {};
      for (const [sym, j] of results) map[sym] = j;
      setData(map);
    } finally {
      setLoading(false);
    }
  }

  useEffect(()=>{ load(); }, []);
  useEffect(()=>{
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(load, REFRESH_MS);
    return ()=> clearInterval(timer.current);
  }, []);

  return (
    <main style={{minHeight:"100vh", background:"#0f1115", color:"#e6e6e6", fontFamily:"system-ui"}}>
      <header style={{padding:"18px 24px", borderBottom:"1px solid #23283b", display:"flex", gap:16, alignItems:"center"}}>
        <h1 style={{margin:0, fontSize:22}}>KriptoGözÜ • Binance Futures</h1>
        <span style={{opacity:.7}}>({INTERVAL})</span>
        <button onClick={load} disabled={loading}
          style={{marginLeft:"auto", padding:"8px 12px", background:"#1a1f2e", border:"1px solid #2a2f45", borderRadius:10, color:"#fff", fontWeight:700, cursor:"pointer"}}>
          {loading ? "Yükleniyor…" : "Yenile"}
        </button>
      </header>

      <section style={{padding:"16px 24px", display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))", gap:12}}>
        {SYMBOLS.map(sym => <CoinCard key={sym} sym={sym} row={data[sym]} />)}
      </section>
    </main>
  );
}

function CoinCard({ sym, row }) {
  const L = row?.latest;
  // Özet metrikler
  const close = L?.close, ema20 = L?.ema20, rsi = L?.rsi14, k = L?.stochK, d = L?.stochD, bu = L?.bbUpper, bl = L?.bbLower;
  const emaDist = (close!=null && ema20!=null) ? ((close-ema20)/ema20*100) : null;        // fiyat/EMA20 %
  const bandPos = (bu!=null && bl!=null && close!=null) ? ((close-bl)/(bu-bl)*100) : null; // banttaki konum %
  const bandWid = (bu!=null && bl!=null && close!=null) ? ((bu-bl)/close*100) : null;      // bant genişliği %
  const kCross  = (k!=null && d!=null) ? (k-d) : null;                                      // K-%D farkı

  // Hızlı renk sinyali (çok basit – sonra kuralları geliştiririz)
  const bullScore =
    (emaDist>0?1:0) +
    (rsi!=null && rsi>50?1:0) +
    (kCross!=null && kCross>0?1:0);
  const border = bullScore>=2 ? "#1f7a4f" : bullScore<=1 ? "#7a2e2e" : "#2a2f45";

  return (
    <Link href={`/coin/${sym}`} style={{textDecoration:"none"}}>
      <div style={{
        background:"#151a2b", border:`1px solid ${border}`, borderRadius:12, padding:14,
        display:"grid", gap:10, gridTemplateRows:"auto auto"
      }}>
        <div style={{display:"flex", alignItems:"baseline", gap:10}}>
          <div style={{fontWeight:800, fontSize:18, color:"#8bd4ff"}}>{sym}</div>
          <div style={{opacity:.8, fontSize:13}}>Close: {fmt(close)}</div>
        </div>

        {/* Özet indikatör pulları */}
        <div style={{display:"flex", flexWrap:"wrap", gap:8}}>
          <Pill label="EMA20"  value={`${pct(emaDist)}`}           hint={`Fiyat/EMA20: ${pct(emaDist)}`}/>
          <Pill label="RSI(14)" value={fmt(rsi,2)}                  hint={rsiInfo(rsi)}/>
          <Pill label="Stoch K-D" value={kCross==null?"—":sign(kCross)} hint="K - %D"/>
          <Pill label="Band Pos" value={pct(bandPos)}               hint="Banttaki konum"/>
          <Pill label="Band Gen" value={pct(bandWid)}               hint="Bant genişliği"/>
        </div>

        <div style={{opacity:.7, fontSize:12}}>
          Tıkla → detay, grafik ve AI plan
        </div>
      </div>
    </Link>
  );
}

function Pill({ label, value, hint }) {
  return (
    <div title={hint}
      style={{display:"inline-flex", gap:6, alignItems:"center", padding:"6px 8px", background:"#0f1424",
              border:"1px solid #26304a", borderRadius:999}}>
      <span style={{opacity:.8, fontSize:12}}>{label}</span>
      <strong style={{fontSize:12}}>{value}</strong>
    </div>
  );
}

function rsiInfo(rsi){
  if (rsi==null) return "—";
  if (rsi>=70) return "Aşırı Alım";
  if (rsi<=30) return "Aşırı Satım";
  return "Nötr";
}






