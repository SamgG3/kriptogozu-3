// pages/index.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";

// RealtimePanel'i sadece client'ta çalıştır
const RealtimePanel = dynamic(() => import("../components/RealtimePanel"), { ssr: false });

const INDICATORS_API = (sym, interval) =>
  `/api/futures/indicators?symbol=${sym}&interval=${interval}&limit=300`;

const MAX_RESULTS = 12; // tabloda en fazla bu kadar sembol göster
const FALLBACK = ["BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","ADAUSDT","DOGEUSDT"];

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
  const close=L?.close, ema=L?.ema20, rsi=L?.rsi14, k=L?.stochK, d=L?.stochD, bu=L?.bbUpper, bl=L?.bbLower;
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

  // Tema & arama & veri durumları
  const [darkMode, setDarkMode] = useState(false);
  const [query, setQuery] = useState("");

  // Kataloglar
  const [allSymbols, setAllSymbols] = useState(FALLBACK);   // Binance USDT perpetual katalog
  const [adminSymbols, setAdminSymbols] = useState(FALLBACK); // admin localStorage listesi (varsa)

  // Görünüm & veri
  const [interval, setIntervalStr] = useState("1m");
  const [rows, setRows] = useState({});
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const timer = useRef(null);

  // 1) Admin listesi (varsayılan görünüm olarak kullan)
  useEffect(()=>{
    if (typeof window === "undefined") return;
    try{
      const raw = localStorage.getItem("kg-admin-symbols");
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length) {
          setAdminSymbols(Array.from(new Set(arr.map(s=>String(s).toUpperCase()))));
        }
      }
    }catch{}
  },[]);

  // 2) Binance USDT Futures katalog (TRADING) — client'ta çekiyoruz
  useEffect(()=>{
    let stop=false;
    async function pull(){
      try{
        const r = await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo", { cache:"no-store" });
        const j = await r.json();
        const syms = (j?.symbols||[])
          .filter(s => s?.contractType==="PERPETUAL" && s?.status==="TRADING" && /USDT$/.test(s?.symbol||""))
          .map(s => s.symbol.toUpperCase());
        if (!stop && syms.length) setAllSymbols(Array.from(new Set(syms)));
      }catch{}
    }
    pull();
    return ()=>{ stop=true; };
  },[]);

  // 3) Arama filtresi (admin listesi + tüm katalog)
  const filtered = useMemo(()=>{
    const q = query.trim().toUpperCase();
    const base = Array.from(new Set([...adminSymbols, ...allSymbols])); // admin öncelikli birleşik
    if (!q) return base.slice(0, MAX_RESULTS);

    // baştaki eşleşmelere öncelik ver, sonra içerenler
    const starts = base.filter(s => s.startsWith(q));
    const contains = base.filter(s => !s.startsWith(q) && s.includes(q));
    return [...starts, ...contains].slice(0, MAX_RESULTS);
  }, [query, adminSymbols, allSymbols]);

  // 4) Veri çekme
  async function load(list = filtered) {
    try {
      setLoading(true);
      const res = await Promise.all(
        list.map(sym =>
          fetch(INDICATORS_API(sym, interval), { cache:"no-store" })
            .then(r=>r.ok ? r.json() : null)
            .catch(()=>null)
        )
      );
      const map = {};
      list.forEach((sym, i)=> map[sym] = res[i]);
      setRows(map);
    } finally { setLoading(false); }
  }

  useEffect(()=>{ load(filtered); }, [interval, filtered]);
  useEffect(()=>{
    if (timer.current) clearInterval(timer.current);
    if (auto) timer.current = setInterval(()=>load(filtered), 10000);
    return ()=> { if (timer.current) clearInterval(timer.current); };
  }, [auto, interval, filtered]);

  const rootStyle = {
    padding: "16px 18px",
    background: darkMode ? "#0b0d14" : "#0f1320",
    minHeight: "100vh",
    color: "#f2f4f8",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
  };

  return (
    <main style={rootStyle}>
      {/* ÜST BAR */}
      <div style={{display:"flex", gap:12, alignItems:"center", marginBottom:12, flexWrap:"wrap"}}>
        <h1 style={{margin:0, fontSize:22, fontWeight:900}}>KriptoGözü • Genel Panel</h1>
        <span style={{opacity:.85}}>(kartlarda AI özet • detay için tıkla)</span>

        {/* Arama kutusu */}
        <input
          value={query}
          onChange={e=>setQuery(e.target.value)}
          placeholder="Sembol ara (örn: BTC, ETH, OP, TAO, SEI...)"
          style={{padding:"8px 12px", background:"#121826", border:"1px solid #2b3247", borderRadius:10, color:"#e8ecf1", minWidth:260}}
        />

        <select value={interval} onChange={e=>setIntervalStr(e.target.value)}
          style={{padding:"8px 10px", background:"#121826", border:"1px solid #2b3247", borderRadius:10, color:"#e8ecf1"}}>
          {["1m","5m","15m","1h","4h"].map(x=><option key={x} value={x}>{x}</option>)}
        </select>

        <button onClick={()=>load(filtered)} disabled={loading}
          style={{padding:"8px 12px", background:"#1b2235", border:"1px solid #2e3750", borderRadius:10, color:"#fff", fontWeight:800}}>
          {loading? "Yükleniyor…" : "Yenile"}
        </button>

        <button
          onClick={() => setDarkMode(v=>!v)}
          style={{ padding:"8px 12px", background:"#2a2f45", border:"1px solid #3a4360",
                   borderRadius:10, color:"#fff", fontWeight:800 }}
        >
          Tema: {darkMode ? "Koyu" : "Daha Koyu"}
        </button>

        <label style={{marginLeft:8, display:"flex", alignItems:"center", gap:8}}>
          <input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/>
          10 sn’de bir otomatik yenile
        </label>
      </div>

      {/* 1) CANLI TABLO (Realtime) */}
      <section style={{marginBottom:18}}>
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8}}>
          <div style={{fontWeight:800, opacity:.95}}>Canlı Akış (Binance Futures)</div>
          <div style={{opacity:.75, fontSize:12}}>
            Semboller: {filtered.join(", ") || "—"}
          </div>
        </div>

        <div style={{border:"1px solid #232a3d", borderRadius:14, overflow:"hidden", background:"#0f1320"}}>
          <div style={{display:"grid", gridTemplateColumns:"3fr 2fr 2fr 2fr 2fr 1fr", padding:"10px 12px", fontWeight:700, background:"#151b2c", color:"#dbe4ff"}}>
            <div>Sembol</div>
            <div style={{textAlign:"right"}}>Fiyat</div>
            <div style={{textAlign:"right"}}>24s Değişim</div>
            <div style={{textAlign:"center"}}>Risk</div>
            <div style={{textAlign:"center"}}>Long/Short</div>
            <div style={{textAlign:"center"}}>⭐</div>
          </div>

          <RealtimePanel
            symbols={filtered}
            staleAfterMs={5000}
            longShortFetchEveryMs={30000}
            onOpenDetails={(symbol) => router.push(`/coin/${symbol}`)}
          />
        </div>
      </section>

      {/* 2) KARTLAR */}
      <section>
        <div style={{fontWeight:800, opacity:.95, margin:"8px 0 12px"}}>Hızlı Özet Kartları</div>
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(290px, 1fr))", gap:14}}>
          {filtered.map(sym => <CoinCard key={sym} sym={sym} row={rows[sym]} />)}
        </div>
      </section>
    </main>
  );
}

function CoinCard({ sym, row }) {
  const L = row?.latest || {};
  const close = L?.close;

  const { longPct, shortPct } = biasFromLatest(L);
  const signal = longPct >= 55 ? "AL" : shortPct >= 55 ? "SAT" : "NÖTR";
  const color  = signal === "AL" ? "#22d39a" : signal === "SAT" ? "#ff6b6b" : "#a9b0c0";
  const border = signal === "AL" ? "#1e7a57" : signal === "SAT" ? "#7a2e2e" : "#2b3247";

  return (
    <Link href={`/coin/${sym}`} legacyBehavior>
      <a style={{ textDecoration:"none" }}>
        <div style={{
          background:"linear-gradient(180deg, #0f1320, #0c111b)",
          border:`1px solid ${border}`,
          borderRadius:14,
          padding:16,
          display:"grid",
          gridTemplateColumns:"1fr auto",
          alignItems:"center",
          gap:10,
          minHeight:96,
          boxShadow:"0 6px 18px rgba(0,0,0,.35)"
        }}>
          <div style={{display:"grid", gap:6}}>
            <div style={{fontWeight:900, fontSize:18, color:"#8bd4ff", letterSpacing:.3}}>{sym}</div>
            <div style={{opacity:.95, color:"#dbe4ff"}}>Son Fiyat: <b style={{color:"#ffffff"}}>{fmtPrice(close)}</b></div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontWeight:900, color, fontSize:18}}>{signal}</div>
            <div style={{opacity:.95, marginTop:6, fontWeight:800}}>
              <span style={{color:"#22d39a"}}>Long {fmt(longPct,0)}%</span>
              <span style={{opacity:.6, margin:"0 6px"}}>/</span>
              <span style={{color:"#ff6b6b"}}>Short {fmt(shortPct,0)}%</span>
            </div>
            <div style={{opacity:.7, fontSize:12, marginTop:6, color:"#aab3c5"}}>Tıkla → detay</div>
          </div>
        </div>
      </a>
    </Link>
  );
}

