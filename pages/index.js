// pages/index.js
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";

// (ÖNEMLİ) RealtimePanel'i yalnızca client'ta render et
const RealtimePanel = dynamic(() => import("../components/RealtimePanel"), { ssr: false });

const DEFAULTS = ["BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","ADAUSDT","DOGEUSDT"];

const fmtPrice = (v)=>{
  if (v==null || isNaN(v)) return "—";
  const a = Math.abs(v);
  const d = a >= 100 ? 2 : a >= 1 ? 4 : 6;
  return Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d, maximumFractionDigits:d});
};
const fmt = (v,d=2)=> (v==null||isNaN(v)) ? "—" :
  Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d, maximumFractionDigits:d});
const clamp = (x,min,max)=> Math.max(min, Math.min(max,x));

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

export default function Home() {
  const router = useRouter();

  const [symbols] = useState(DEFAULTS);
  const [interval, setIntervalStr] = useState("1m");
  const [rows, setRows] = useState({});
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const timer = useRef(null);

  async function load() {
    try {
      setLoading(true);
      const res = await Promise.all(
        symbols.map(sym =>
          fetch(`/api/futures/indicators?symbol=${sym}&interval=${interval}&limit=300`, { cache:"no-store" })
            .then(r=>r.ok ? r.json() : null)
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
    return ()=> { if (timer.current) clearInterval(timer.current); };
  }, [auto, interval, symbols]);

  return (
    <main style={{padding:"16px 18px", background:"#0b0b0f", minHeight:"100vh", color:"#e6e6e6"}}>
      {/* ÜST BAR */}
      <div style={{display:"flex", gap:12, alignItems:"center", marginBottom:12, flexWrap:"wrap"}}>
        <h1 style={{margin:0, fontSize:20, fontWeight:800}}>KriptoGözü • Genel Panel</h1>
        <span style={{opacity:.7}}>(kartlarda AI özet • detay için tıkla)</span>
        <select value={interval} onChange={e=>setIntervalStr(e.target.value)}
          style={{padding:"8px 10px", background:"#121625", border:"1px solid #23283b", borderRadius:10, color:"#e6e6e6", marginLeft:10}}>
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

      {/* 1) CANLI AKIŞ TABLOSU (WebSocket) */}
      <section style={{marginBottom:16}}>
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8}}>
          <div style={{fontWeight:700, opacity:.9}}>Canlı Akış (Binance Futures)</div>
          <div style={{opacity:.6, fontSize:12}}>Semboller: {symbols.join(", ")}</div>
        </div>

        <RealtimePanel
          symbols={symbols}
          staleAfterMs={5000}
          longShortFetchEveryMs={30000}
          onOpenDetails={(symbol) => router.push(`/coin/${symbol}`)}
        />
      </section>

      {/* 2) KART GÖRÜNÜMÜ */}
      <section>
        <div style={{fontWeight:700, opacity:.9, margin:"8px 0 12px"}}>Hızlı Özet Kartları</div>
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))", gap:12}}>
          {symbols.map(sym => <CoinCard key={sym} sym={sym} row={rows[sym]} />)}
        </div>
      </section>
    </main>
  );
}

function CoinCard({ sym, row }) {
  const L = row?.latest || {};
  const close = L.close;

  const { longPct, shortPct } = biasFromLatest(L);
  const signal = longPct >= 55 ? "AL" : shortPct >= 55 ? "SAT" : "NÖTR";
  const color  = signal === "AL" ? "#20c997" : signal === "SAT" ? "#ff6b6b" : "#89a";
  const border = signal === "AL" ? "#1f7a4f" : signal === "SAT" ? "#7a2e2e" : "#2a2f45";

  return (
    <Link href={`/coin/${sym}`} legacyBehavior>
      <a style={{ textDecoration:"none" }}>
        <div style={{
          background:"#151a2b",
          border:`1px solid ${border}`,
          borderRadius:12,
          padding:14,
          display:"grid",
          gridTemplateColumns:"1fr auto",
          alignItems:"center",
          gap:10,
          minHeight:86
        }}>
          <div style={{display:"grid", gap:4}}>
            <div style={{fontWeight:800, fontSize:18, color:"#8bd4ff"}}>{sym}</div>
            <div style={{opacity:.85}}>Son Fiyat: <b>{fmtPrice(close)}</b></div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontWeight:800, color}}>{signal}</div>
            <div style={{opacity:.9, marginTop:4}}>
              <span style={{color:"#20c997", fontWeight:700}}>Long {fmt(longPct,0)}%</span>
              <span style={{opacity:.7}}> / </span>
              <span style={{color:"#ff6b6b", fontWeight:700}}>Short {fmt(shortPct,0)}%</span>
            </div>
            <div style={{opacity:.6, fontSize:12, marginTop:6}}>Tıkla → detay</div>
          </div>
        </div>
      </a>
    </Link>
  );
}









