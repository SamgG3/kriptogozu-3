// pages/panel-sinyal.js
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

/**
 * Panel-Sinyal PRO (Gün-İçi)
 * - Erişim: "kurucu" | "yonetici" | "arkadas"
 * - Canlı fiyat: Binance Futures miniTicker WS (~1 sn)
 * - Mod: Scalper (1m+5m) | Gün-İçi (5m+15m+1h) + opsiyonel 3m/30m/4h
 * - Potansiyel: 1D/12h BB mesafesi (≥ %15/%20/%30 filtre)
 * - Momentum: RSI, Stoch(K>D), close>EMA20, BB pozisyonu (ağırlıklı)
 * - Filtreler: MTF aynı yön, Rejim (EMA20), Sıkışma (15m BBwidth)
 * - Teyitler (opsiyonel, endpoint yoksa sessiz geçer): Whale Netflow, OI değişim, Funding
 * - Entry/SL/TP1-3: ATR(15m)*k (k=1.5 varsayılan)
 * - Risk: Sermaye + Risk% → önerilen pozisyon büyüklüğü (USDT notional)
 * - Skor (0-100): momentum + potansiyel + teyitler
 * - Backtest (beta): 15m seri üzerinde basit kural testi (seçili 5 coin)
 * - Paper Trade (beta): satırdan simüle aç/kapat, localStorage'da takip
 * - Bilgi amaçlıdır, yatırım tavsiyesi değildir.
 */

const ALLOWED_ROLES = new Set(["kurucu", "yonetici", "arkadas"]);

const SCAN_SYMBOLS = [
  "BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","ADAUSDT","DOGEUSDT",
  "LINKUSDT","TRXUSDT","MATICUSDT","DOTUSDT","AVAXUSDT","OPUSDT","ARBUSDT",
  "TONUSDT","ATOMUSDT","APTUSDT","FILUSDT","NEARUSDT","SUIUSDT"
];

const MODES = {
  scalper: ["1m","5m"],
  intraday: ["5m","15m","1h"]
};
const REFRESH_MS = 20_000;

/* ========== Helpers ========== */
const fmt = (v, d=2) => (v==null || isNaN(v)) ? "—"
  : Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d, maximumFractionDigits:d});

function bandPos(L){
  const c=L?.close, bu=L?.bbUpper, bl=L?.bbLower;
  if(c==null || bu==null || bl==null || bu===bl) return null;
  return ((c - bl)/(bu - bl))*100;
}
function bbWidthPct(L){
  const c=L?.close, bu=L?.bbUpper, bl=L?.bbLower;
  if(c==null || bu==null || bl==null) return null;
  return (bu - bl) / c;
}
function momentumScore(L){
  if(!L) return 0;
  let s = 0;
  if (L.rsi14!=null){ if(L.rsi14>=55) s+=1; if(L.rsi14<=45) s-=1; }
  if (L.stochK!=null && L.stochD!=null){
    if (L.stochK>L.stochD) s+=1;
    if (L.stochK<L.stochD) s-=1;
  }
  if (L.close!=null && L.ema20!=null){
    if (L.close>L.ema20) s+=1; else s-=1;
  }
  const bp = bandPos(L);
  if (bp!=null){ if(bp>=55) s+=0.5; if(bp<=45) s-=0.5; }
  return s; // ~ -3.5..+3.5
}
const IV_WEIGHT = { "1m":0.9, "3m":0.9, "5m":1.0, "15m":1.2, "30m":1.1, "1h":1.4, "4h":1.0 };

function decideDirection(frames){
  let wsum=0, wtot=0;
  for(const [iv,L] of Object.entries(frames)){
    const w = IV_WEIGHT[iv] ?? 1;
    wsum += momentumScore(L)*w;
    wtot += w;
  }
  const avg = wtot ? wsum/wtot : 0;
  if (avg >= 1.0)  return { dir:"LONG",  conf: Math.min(1,  avg/3.5) };
  if (avg <= -1.0) return { dir:"SHORT", conf: Math.min(1, -avg/3.5) };
  return { dir:"NEUTRAL", conf: 0.3 };
}

function reasonsText(frames, dir, potTxt, extraNotes){
  const p=[];
  const brief=(tag,L)=>{
    if(!L) return;
    if (L.rsi14!=null) p.push(`${tag} RSI=${fmt(L.rsi14,0)}`);
    if (L.stochK!=null && L.stochD!=null) p.push(`${tag} Stoch ${L.stochK>L.stochD?"↑":L.stochK<L.stochD?"↓":"="}`);
    if (L.close!=null && L.ema20!=null) p.push(`${tag} ${L.close>L.ema20?"EMA20 üstü":"EMA20 altı"}`);
  };
  ["1m","3m","5m","15m","30m","1h","4h"].forEach(iv => frames[iv] && brief(iv,frames[iv]));
  if (potTxt) p.push(potTxt);
  (extraNotes||[]).forEach(n => p.push(n));
  return p.slice(0,6).join(" • ");
}

/* ========== API helpers ========== */
async function getLatest(symbol, interval){
  try{
    const r = await fetch(`/api/futures/indicators?symbol=${symbol}&interval=${interval}&limit=200`, { cache:"no-store" });
    const j = await r.json();
    return j?.latest || null;
  }catch{ return null; }
}
async function getSeries(symbol, interval, limit=500){
  try{
    const r = await fetch(`/api/futures/indicators?symbol=${symbol}&interval=${interval}&limit=${limit}`, { cache:"no-store" });
    const j = await r.json();
    // Beklenen: { rows:[ {...}, ... ] } veya fallback yoksa []
    return Array.isArray(j?.rows) ? j.rows : [];
  }catch{ return []; }
}
// Opsiyonel teyitler – endpoint yoksa no-op
async function getMetrics(symbol){
  try{
    const r = await fetch(`/api/futures/metrics?symbol=${symbol}&lookback=15m`, { cache:"no-store" });
    const j = await r.json();
    return {
      oiChangePct: Number(j?.oiChangePct) || 0,
      fundingRate: Number(j?.fundingRate) || 0,
      whaleNetflowUsd: Number(j?.whaleNetflowUsd) || 0
    };
  }catch{ return { oiChangePct:0, fundingRate:0, whaleNetflowUsd:0 }; }
}

/* ========== Component ========== */
export default function PanelSinyal(){
  const router = useRouter();

  /* --- Access --- */
  const [authOk, setAuthOk] = useState(false);
  useEffect(()=>{
    if(typeof window==="undefined") return;
    const raw=localStorage.getItem("kgz_user");
    let u=null; try{u=raw?JSON.parse(raw):null;}catch{}
    const role=u?.role;
    if(!role || !ALLOWED_ROLES.has(role)) router.replace("/login?next=/panel-sinyal");
    else setAuthOk(true);
  },[router]);

  /* --- Live price WS --- */
  const [wsTicks, setWsTicks] = useState({});
  useEffect(()=>{
    if(!authOk) return;
    const streams = SCAN_SYMBOLS.map(s=>`${s.toLowerCase()}@miniTicker`).join("/");
    const url = `wss://fstream.binance.com/stream?streams=${streams}`;
    let ws, tmr, pend={};
    try{
      ws=new WebSocket(url);
      ws.onmessage=(ev)=>{
        try{
          const d=JSON.parse(ev.data)?.data;
          if(!d?.s) return;
          const last = d?.c ? +d.c : null;
          const chg  = d?.P !== undefined ? +d.P : (d?.o && d?.c) ? ((+d.c - +d.o)/+d.o)*100 : null;
          pend[d.s]={last, chg};
          if(!tmr){ tmr=setTimeout(()=>{ setWsTicks(prev=>({...prev,...pend})); pend={}; tmr=null; }, 1000); }
        }catch{}
      };
    }catch{}
    return ()=>{ try{ ws && ws.close(); }catch{} };
  },[authOk]);

  /* --- UI state --- */
  const [mode, setMode] = useState("intraday"); // "scalper" | "intraday"
  const [use3m, setUse3m] = useState(false);
  const [use30m, setUse30m] = useState(false);
  const [use4h, setUse4h] = useState(false);

  const [potIv, setPotIv]   = useState("1d"); // "1d" | "12h"
  const [minPot, setMinPot] = useState(0.20); // 0.15 | 0.20 | 0.30
  const [sameDir, setSameDir] = useState(true);
  const [useRegime, setUseRegime] = useState(true);
  const [useSqueeze, setUseSqueeze] = useState(false);
  const [sqThresh, setSqThresh] = useState(0.012);

  const [useWhale, setUseWhale] = useState(true);
  const [useOI, setUseOI] = useState(true);
  const [useFunding, setUseFunding] = useState(true);

  // Risk
  const [capital, setCapital] = useState(0);
  const [riskPct, setRiskPct] = useState(0.5);
  const [atrK, setAtrK] = useState(1.5);
  const [timeStopMin, setTimeStopMin] = useState(60);

  // Favorites (opsiyonel)
  const [favs, setFavs] = useState([]);
  useEffect(()=>{ if(typeof window!=="undefined"){ try{ const arr=JSON.parse(localStorage.getItem("kgz_favs")||"[]"); if(Array.isArray(arr)) setFavs(arr); }catch{} } },[]);
  const [onlyFavs, setOnlyFavs] = useState(false);

  const activeIntervals = useMemo(()=>{
    const base = [...MODES[mode]];
    if (use3m)  base.includes("3m") || base.splice(1,0,"3m");
    if (use30m) base.push("30m");
    if (use4h)  base.push("4h");
    return base;
  },[mode,use3m,use30m,use4h]);

  /* --- Scan --- */
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);

  async function doScan(){
    setLoading(true);
    try{
      const tasks = SCAN_SYMBOLS
        .filter(sym => !onlyFavs || favs.includes(sym))
        .map(async (sym)=>{
          // Pot çerçeve + aktif frameler + ATR(15m) + teyitler
          const reqs = [
            getLatest(sym, potIv),
            ...activeIntervals.map(iv=>getLatest(sym, iv)),
            getLatest(sym, "15m"),
            (useWhale || useOI || useFunding) ? getMetrics(sym) : Promise.resolve({oiChangePct:0,fundingRate:0,whaleNetflowUsd:0})
          ];
          const res = await Promise.all(reqs);

          const Lpot = res[0];
          if (!Lpot?.close || Lpot.bbUpper==null || Lpot.bbLower==null) return null;

          const frames = {};
          activeIntervals.forEach((iv,i)=> frames[iv] = res[i+1]);

          const atrRef = res[1+activeIntervals.length];
          const atr = (atrRef?.atr14 && atrRef?.close) ? Number(atrRef.atr14) : null;

          const metrics = res[2+activeIntervals.length] || {oiChangePct:0,fundingRate:0,whaleNetflowUsd:0};

          // Momentum & yön
          const { dir, conf } = decideDirection(frames);
          if (dir==="NEUTRAL") return null;

          // MTF aynı yön
          if (sameDir){
            const signs = activeIntervals.map(iv=>{
              const s = momentumScore(frames[iv]);
              return s===0?0:(s>0?1:-1);
            }).filter(x=>x!==0);
            if (signs.length && !signs.every(x=>x===signs[0])) return null;
          }

          // Rejim (EMA20)
          if (useRegime){
            const L15=frames["15m"], L1h=frames["1h"];
            if (dir==="LONG"){
              if (L15 && !(L15.close>L15.ema20)) return null;
              if (L1h && !(L1h.close>L1h.ema20)) return null;
            }else{
              if (L15 && !(L15.close<L15.ema20)) return null;
              if (L1h && !(L1h.close<L1h.ema20)) return null;
            }
          }

          // Sıkışma (15m BBwidth)
          if (useSqueeze){
            const w15 = bbWidthPct(frames["15m"]);
            if (w15==null || !(w15 <= sqThresh)) return null;
          }

          // Potansiyel
          const c = Number(Lpot.close);
          const up   = (Number(Lpot.bbUpper) - c)/c;
          const down = (c - Number(Lpot.bbLower))/c;
          let pickPot=null, potTxt="";
          if (dir==="LONG"  && up  !=null){ pickPot=up;   potTxt=`${potIv.toUpperCase()} pot≈+${fmt(up*100,0)}%`; }
          if (dir==="SHORT" && down!=null){ pickPot=down; potTxt=`${potIv.toUpperCase()} pot≈-${fmt(down*100,0)}%`; }
          if (pickPot==null || pickPot < minPot) return null;

          // Teyitler (küçük boost)
          let confBoost = 0; const notes=[];
          if (useWhale && metrics.whaleNetflowUsd){
            const nf = metrics.whaleNetflowUsd;
            if (dir==="LONG"  && nf>0) { confBoost += 0.1; notes.push("Whale Netflow ↑"); }
            if (dir==="SHORT" && nf<0) { confBoost += 0.1; notes.push("Whale Netflow ↓"); }
          }
          if (useOI && metrics.oiChangePct){
            const oi = metrics.oiChangePct;
            if (oi>0) { confBoost += 0.1; notes.push(`OI ${fmt(oi,1)}%`); }
          }
          if (useFunding && metrics.fundingRate){
            const f = metrics.fundingRate;
            if (dir==="LONG"  && f<0) { confBoost += 0.05; notes.push(`Funding ${fmt(f*100,3)}%`); }
            if (dir==="SHORT" && f>0) { confBoost += 0.05; notes.push(`Funding ${fmt(f*100,3)}%`); }
          }

          // Skor
          const baseConf = conf || 0.4;
          const potNorm  = Math.min(1, (pickPot / 0.5)); // %50+ → 1
          const score01  = Math.max(0, Math.min(1, 0.55*baseConf + 0.35*potNorm + 0.10*confBoost));
          const score100 = Math.round(score01*100);

          // Fiyat
          const price = wsTicks[sym]?.last ??
                        frames["15m"]?.close ??
                        frames["1h"]?.close ??
                        Lpot?.close;

          // Entry/SL/TP
          let entry = price, sl=null, tp1=null, tp2=null, tp3=null;
          if (entry && atr){
            const risk = atrK*atr;
            if (dir==="LONG"){
              sl  = entry - risk; tp1 = entry + risk; tp2 = entry + risk*2; tp3 = entry + risk*3;
            } else {
              sl  = entry + risk; tp1 = entry - risk; tp2 = entry - risk*2; tp3 = entry - risk*3;
            }
          }

          // Önerilen pozisyon (USDT notional)
          let posUSDT = null;
          if (entry && sl && capital>0 && riskPct>0){
            const riskDollar = (capital * (riskPct/100));
            const perUnitRisk = Math.abs(entry - sl);
            if (perUnitRisk>0) posUSDT = riskDollar / perUnitRisk;
          }

          const reasons = reasonsText(frames, dir, potTxt, notes);

          return { sym, dir, score:score100, potPct:Math.round(pickPot*100), price, reasons,
                   entry, sl, tp1, tp2, tp3, posUSDT };
        });

      const res = await Promise.all(tasks);
      const out = res.filter(Boolean);
      out.sort((a,b)=> (b.score - a.score) || (b.potPct - a.potPct));
      setRows(out);
    } finally { setLoading(false); }
  }

  // Auto refresh
  useEffect(()=>{
    if(!authOk) return;
    let t = setInterval(doScan, REFRESH_MS);
    doScan();
    return ()=> clearInterval(t);
  }, [authOk, mode, use3m, use30m, use4h, potIv, minPot, sameDir, useRegime, useSqueeze, sqThresh, useWhale, useOI, useFunding, atrK, capital, riskPct]);

  /* --- Paper trade (beta) --- */
  const [paperOn, setPaperOn] = useState(false);
  const [paper, setPaper] = useState([]);
  useEffect(()=>{ if(typeof window!=="undefined"){ try{ setPaper(JSON.parse(localStorage.getItem("kgz_paper")||"[]")); }catch{} } },[]);
  useEffect(()=>{ if(typeof window!=="undefined"){ try{ localStorage.setItem("kgz_paper", JSON.stringify(paper)); }catch{} } },[paper]);

  const openPaper = (s)=>{
    if(!paperOn) return;
    const p = {
      id: Date.now()+"-"+s.sym,
      sym:s.sym, dir:s.dir, entry:s.entry, sl:s.sl, tp1:s.tp1, tp2:s.tp2, tp3:s.tp3,
      status:"OPEN", openedAt: Date.now()
    };
    setPaper(prev=> [p, ...prev]);
  };
  // Fiyat geldiğinde kapatma kontrolü (basit: son fiyata göre)
  useEffect(()=>{
    if(!paperOn || !Object.keys(wsTicks).length) return;
    setPaper(prev=>{
      return prev.map(o=>{
        if(o.status!=="OPEN") return o;
        const last = wsTicks[o.sym]?.last;
        if(!last) return o;
        if(o.dir==="LONG"){
          if(last<=o.sl) return {...o, status:"SL", closedAt:Date.now(), exit:last};
          if(o.tp3 && last>=o.tp3) return {...o, status:"TP3", closedAt:Date.now(), exit:last};
          if(o.tp2 && last>=o.tp2) return {...o, status:"TP2", closedAt:Date.now(), exit:last};
          if(o.tp1 && last>=o.tp1) return {...o, status:"TP1", closedAt:Date.now(), exit:last};
        }else{
          if(last>=o.sl) return {...o, status:"SL", closedAt:Date.now(), exit:last};
          if(o.tp3 && last<=o.tp3) return {...o, status:"TP3", closedAt:Date.now(), exit:last};
          if(o.tp2 && last<=o.tp2) return {...o, status:"TP2", closedAt:Date.now(), exit:last};
          if(o.tp1 && last<=o.tp1) return {...o, status:"TP1", closedAt:Date.now(), exit:last};
        }
        return o;
      });
    });
  }, [wsTicks, paperOn]);

  /* --- Backtest (beta) --- */
  const [bt, setBt] = useState(null);
  const runBacktest = async ()=>{
    setBt({ running:true });
    try{
      const pick = SCAN_SYMBOLS.slice(0,5); // hızlı deneme: 5 coin
      let trades=0, wins=0, sumR=0, maxDD=0, eq=0, peak=0;

      for(const sym of pick){
        const series = await getSeries(sym, "15m", 500);
        if(series.length<60) continue;

        // basit kural: momentumScore>1 → LONG, <-1 → SHORT, rejim (ema20) aynı yöne
        let pos=null;
        for(let i=30;i<series.length;i++){
          const L = series[i];
          const s = momentumScore(L);
          const dir = (s>=1 ? "LONG" : s<=-1 ? "SHORT" : "NEUTRAL");
          const okReg = dir==="NEUTRAL" ? false :
            (dir==="LONG" ? (L.close>L.ema20) : (L.close<L.ema20));

          // ATR tabanlı 1R
          const atr = Number(L.atr14)||0;
          const entry = Number(L.close)||0;
          const R = 1.5*atr;

          // pozisyon yoksa aç
          if(!pos && dir!=="NEUTRAL" && okReg && R>0){
            const sl = dir==="LONG" ? entry-R : entry+R;
            const tp = dir==="LONG" ? entry+R : entry-R;
            pos = { dir, entry, sl, tp };
            continue;
          }
          // varsa kapat
          if(pos){
            const c = Number(L.close)||0;
            const win = pos.dir==="LONG" ? (c>=pos.tp) : (c<=pos.tp);
            const lose= pos.dir==="LONG" ? (c<=pos.sl) : (c>=pos.sl);
            if(win || lose){
              trades++;
              const r = win ? +1 : -1;
              sumR += r;
              if(win) wins++;
              eq += r;
              if(eq>peak) peak=eq;
              const dd = peak - eq;
              if(dd>maxDD) maxDD=dd;
              pos=null;
            }
          }
        }
      }
      setBt({ running:false, trades, wins, wr: trades? (wins/trades*100):0, avgR: trades? (sumR/trades):0, maxDD });
    }catch(e){
      setBt({ running:false, error:true });
    }
  };

  if(!authOk) return <main style={{padding:16}}><div style={{opacity:.7}}>Yetki doğrulanıyor…</div></main>;

  return (
    <main style={{ minHeight:"100vh", background:"#0f1320", color:"#e6f0ff", padding:"16px 18px", paddingBottom:60 }}>
      {/* Nav */}
      <nav style={{ display:"flex", gap:16, alignItems:"center", marginBottom:12, flexWrap:"wrap" }}>
        <button
          onClick={()=> (history.length>1 ? history.back() : router.push("/"))}
          style={{ background:"#1a1f2e", border:"1px solid #2a2f45", color:"#fff", borderRadius:8, padding:"6px 10px", cursor:"pointer" }}
        >
          ← Geri
        </button>
        <Link href="/" style={{ color:"#8bd4ff", fontWeight:900, fontSize:18, textDecoration:"none" }}>Kripto Gözü</Link>
        <Link href="/" style={{ color:"#d0d6e6", textDecoration:"none" }}>Ana Sayfa</Link>
        <Link href="/panel" style={{ color:"#d0d6e6", textDecoration:"none" }}>Panel</Link>
        <Link href="/whales" style={{ color:"#d0d6e6", textDecoration:"none" }}>Balina</Link>
        <Link href="/balina2d" style={{ color:"#d0d6e6", textDecoration:"none" }}>Balina2D</Link>
        <span style={{ marginLeft:"auto", display:"flex", gap:10, alignItems:"center" }}>
          <label style={lbl}><input type="checkbox" checked={paperOn} onChange={e=>setPaperOn(e.target.checked)} /> Paper Trade</label>
        </span>
      </nav>

      <h1 style={{ marginTop:0, display:"flex", alignItems:"center", gap:10 }}>
        Panel – Sinyal (PRO) <LiveDot/>
      </h1>

      {/* Controls */}
      <div style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap", marginBottom:12 }}>
        <label style={lbl}>
          Mod
          <select value={mode} onChange={e=>setMode(e.target.value)} style={sel}>
            <option value="scalper">Scalper (1m + 5m)</option>
            <option value="intraday">Gün-İçi (5m + 15m + 1h)</option>
          </select>
        </label>
        <label style={lbl}><input type="checkbox" checked={use3m}  onChange={e=>setUse3m(e.target.checked)} /> 3m</label>
        <label style={lbl}><input type="checkbox" checked={use30m} onChange={e=>setUse30m(e.target.checked)} /> 30m</label>
        <label style={lbl}><input type="checkbox" checked={use4h}  onChange={e=>setUse4h(e.target.checked)} /> 4h</label>

        <label style={lbl}>
          Pot. Çerçeve
          <select value={potIv} onChange={e=>setPotIv(e.target.value)} style={sel}>
            <option value="1d">1D</option>
            <option value="12h">12h</option>
          </select>
        </label>
        <label style={lbl}>
          Min Potansiyel
          <select value={String(minPot)} onChange={e=>setMinPot(Number(e.target.value))} style={sel}>
            <option value="0.15">≥ %15</option>
            <option value="0.20">≥ %20</option>
            <option value="0.30">≥ %30</option>
          </select>
        </label>

        <label style={lbl}><input type="checkbox" checked={sameDir}   onChange={e=>setSameDir(e.target.checked)} /> MTF aynı yön</label>
        <label style={lbl}><input type="checkbox" checked={useRegime}  onChange={e=>setUseRegime(e.target.checked)} /> Rejim filtresi</label>
        <label style={lbl}><input type="checkbox" checked={useSqueeze} onChange={e=>setUseSqueeze(e.target.checked)} /> Sıkışma</label>
        <label style={lbl}>
          BB genişlik
          <select value={String(sqThresh)} onChange={e=>setSqThresh(Number(e.target.value))} style={sel}>
            <option value="0.008">≤ 0.8%</option>
            <option value="0.012">≤ 1.2%</option>
            <option value="0.018">≤ 1.8%</option>
          </select>
        </label>

        <label style={lbl}><input type="checkbox" checked={useWhale}   onChange={e=>setUseWhale(e.target.checked)} /> Whale</label>
        <label style={lbl}><input type="checkbox" checked={useOI}      onChange={e=>setUseOI(e.target.checked)} /> OI</label>
        <label style={lbl}><input type="checkbox" checked={useFunding} onChange={e=>setUseFunding(e.target.checked)} /> Funding</label>

        <label style={lbl}>
          Sermaye (USDT)
          <input type="number" value={capital} onChange={e=>setCapital(Number(e.target.value)||0)} style={{...sel, width:110}} placeholder="0" />
        </label>
        <label style={lbl}>
          Risk %
          <input type="number" step="0.1" value={riskPct} onChange={e=>setRiskPct(Number(e.target.value)||0)} style={{...sel, width:90}} placeholder="0.5" />
        </label>
        <label style={lbl}>
          ATR k
          <select value={String(atrK)} onChange={e=>setAtrK(Number(e.target.value))} style={sel}>
            <option value="1.0">1.0</option>
            <option value="1.25">1.25</option>
            <option value="1.5">1.5</option>
            <option value="2.0">2.0</option>
          </select>
        </label>
        <label style={lbl}>
          Time-Stop
          <select value={String(timeStopMin)} onChange={e=>setTimeStopMin(Number(e.target.value))} style={sel}>
            <option value="30">30 dk</option>
            <option value="60">60 dk</option>
            <option value="90">90 dk</option>
          </select>
        </label>

        <label style={lbl}><input type="checkbox" checked={onlyFavs} onChange={e=>setOnlyFavs(e.target.checked)} /> Sadece Favoriler</label>

        <button onClick={doScan} disabled={loading} style={btn}>{loading ? "Taranıyor…" : "Yenile"}</button>
        <button onClick={runBacktest} style={btnAlt}>{bt?.running ? "Backtest…" : "Backtest (beta)"}</button>
      </div>

      {/* Liste */}
      <div style={{ border:"1px solid #25304a", borderRadius:12, overflow:"hidden", background:"#0f1320" }}>
        <div style={{
          display:"grid",
          gridTemplateColumns:"96px 90px 90px 1fr 290px 160px 112px",
          padding:"10px 12px",
          background:"#151b2c",
          color:"#a9b4c9",
          fontWeight:800
        }}>
          <div>Coin</div>
          <div>Yön</div>
          <div>Skor</div>
          <div>Neden (kısa özet)</div>
          <div>Entry • SL • TP1/2/3</div>
          <div>Önerilen Poz.</div>
          <div>Simülasyon</div>
        </div>

        {rows.length===0 ? (
          <div style={{ padding:"12px 14px", opacity:.75 }}>
            Filtreye uyan güçlü sinyal yok (ayarları değiştirip tekrar dene).
          </div>
        ) : rows.map(s=>{
          const col = s.dir==="LONG" ? "#22d39a" : "#ff6b6b";
          return (
            <div key={s.sym} style={{
              display:"grid",
              gridTemplateColumns:"96px 90px 90px 1fr 290px 160px 112px",
              padding:"10px 12px",
              borderTop:"1px solid #23283b",
              alignItems:"center"
            }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <Link href={`/coin/${s.sym}`} style={{ color:"#8bd4ff", fontWeight:900, textDecoration:"none" }}>{s.sym}</Link>
                <span style={{ opacity:.7 }}>@ {fmt(s.price)}</span>
              </div>
              <div style={{ fontWeight:900, color:col }}>{s.dir}</div>
              <div style={{ fontWeight:900 }}>{fmt(s.score,0)}</div>
              <div style={{ opacity:.95 }}>{s.reasons}</div>
              <div style={{ fontSize:12, lineHeight:1.3 }}>
                {s.entry && s.sl && s.tp1 ? (
                  <>
                    <div><b>Entry:</b> {fmt(s.entry, s.entry>=100?2:4)}</div>
                    <div><b>SL:</b> {fmt(s.sl, s.sl>=100?2:4)}</div>
                    <div><b>TP1/2/3:</b> {fmt(s.tp1, s.tp1>=100?2:4)} • {fmt(s.tp2, s.tp2>=100?2:4)} • {fmt(s.tp3, s.tp3>=100?2:4)}</div>
                    <div style={{opacity:.65}}>ATR(15m)×{atrK} • Time-Stop (öneri): {timeStopMin} dk</div>
                  </>
                ) : <span style={{opacity:.6}}>ATR verisi yok → Entry/SL/TP hesaplanamadı</span>}
              </div>
              <div style={{ fontWeight:800 }}>
                {s.posUSDT ? `${fmt(s.posUSDT,2)} USDT` : <span style={{opacity:.6}}>Sermaye & Risk% gir</span>}
              </div>
              <div>
                <button onClick={()=>openPaper(s)} disabled={!paperOn || !s.entry} style={btnMini}>
                  {paperOn ? "Aç (Simüle)" : "Paper Kapalı"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Backtest sonucu */}
      <div style={{marginTop:12}}>
        {bt?.running ? (
          <div style={{opacity:.8}}>Backtest çalışıyor…</div>
        ) : bt?.error ? (
          <div style={{color:"#ff9e9e"}}>Backtest hata aldı (API seri verisi dönmedi).</div>
        ) : bt ? (
          <div style={{
            display:"grid",
            gridTemplateColumns:"repeat(4, minmax(120px, 1fr))",
            gap:10, marginTop:6
          }}>
            <Stat label="İşlem" value={bt.trades} />
            <Stat label="Win Rate" value={`${fmt(bt.wr,1)}%`} />
            <Stat label="Ortalama R" value={fmt(bt.avgR,2)} />
            <Stat label="Maks. DD (R)" value={fmt(bt.maxDD,2)} />
          </div>
        ) : null}
      </div>

      {/* Paper trade listesi (kısa) */}
      {paperOn && (
        <div style={{marginTop:12}}>
          <h3 style={{margin:"10px 0 6px"}}>Paper Trades</h3>
          {paper.length===0 ? <div style={{opacity:.7}}>Açık/kapanmış işlem yok.</div> : (
            <div style={{border:"1px solid #25304a", borderRadius:10, overflow:"hidden"}}>
              {paper.map(p=>(
                <div key={p.id} style={{display:"grid", gridTemplateColumns:"120px 90px 1fr 140px 110px", gap:8, padding:"8px 10px", borderTop:"1px solid #23283b"}}>
                  <div><b>{p.sym}</b></div>
                  <div>{p.dir}</div>
                  <div style={{opacity:.8}}>E:{fmt(p.entry,4)} SL:{fmt(p.sl,4)} TP1:{fmt(p.tp1,4)}</div>
                  <div style={{fontWeight:800, color:
                    p.status==="OPEN" ? "#9bd0ff" :
                    p.status.startsWith("TP") ? "#22d39a" :
                    "#ff6b6b"
                  }}>{p.status}</div>
                  <div style={{textAlign:"right"}}>
                    {p.status!=="OPEN" && p.exit ? <span>Exit {fmt(p.exit,4)}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p style={{ opacity:.6, marginTop:10, fontSize:12 }}>
        Kaynak: Binance Futures (miniTicker WS + indicators MTF + {potIv.toUpperCase()} potansiyel). Bilgi amaçlıdır, yatırım tavsiyesi değildir.
      </p>
    </main>
  );
}

/* ========== UI bits ========== */
function Stat({label, value}){
  return (
    <div style={{border:"1px solid #2a2f45", borderRadius:10, padding:"10px 12px", background:"#121625"}}>
      <div style={{opacity:.75, fontSize:12}}>{label}</div>
      <div style={{fontWeight:900, fontSize:18}}>{value}</div>
    </div>
  );
}
function LiveDot(){
  return (
    <span style={{display:"inline-flex", alignItems:"center", gap:8}}>
      <span style={{
        width:10, height:10, borderRadius:999, background:"#22d39a",
        boxShadow:"0 0 0 0 rgba(34,211,154,.7)", animation:"pulse 1.5s infinite"
      }}/>
      <span style={{opacity:.8}}>Canlı</span>
      <style jsx>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(34,211,154,.7); }
          70% { box-shadow: 0 0 0 8px rgba(34,211,154,0); }
          100%{ box-shadow: 0 0 0 0 rgba(34,211,154,0); }
        }
      `}</style>
    </span>
  );
}
const lbl = { display:"inline-flex", alignItems:"center", gap:8, padding:"6px 10px", border:"1px solid #2a2f45", background:"#121625", borderRadius:8 };
const sel = { padding:"6px 8px", background:"#0f1320", border:"1px solid #23283b", borderRadius:8, color:"#e6e6e6" };
const btn = { padding:"8px 12px", background:"#1a1f2e", border:"1px solid #2a2f45", borderRadius:10, color:"#fff", fontWeight:700, cursor:"pointer" };
const btnAlt = { ...btn, background:"#142235" };
const btnMini = { ...btn, padding:"6px 8px", fontWeight:800 };
