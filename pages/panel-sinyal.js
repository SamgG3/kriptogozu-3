// pages/panel-sinyal.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

/* ===== Sadece yetkili roller ===== */
const ALLOWED_ROLES = new Set(["kurucu","yonetici","arkadas"]);

/* ===== Yardımcılar ===== */
const clamp = (x,min,max)=> Math.max(min, Math.min(max,x));
const fmt = (v,d=2)=> v==null||isNaN(v) ? "—" :
  Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d, maximumFractionDigits:d});
const fmtPrice = (v)=>{
  if (v==null||isNaN(v)) return "—";
  const a=Math.abs(v); const d = a>=100?2 : a>=1?4 : 6;
  return Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d, maximumFractionDigits:d});
};
const pctTxt = (v)=> v==null||isNaN(v) ? "—" : (v>=0?"+":"")+Number(v).toFixed(2)+"%";

/* ===== Momentum / skor ===== */
function bandPos(L){
  const c=L?.close, bu=L?.bbUpper, bl=L?.bbLower;
  if (c==null||bu==null||bl==null||bu===bl) return null;
  return ( (c-bl)/(bu-bl) )*100;
}
function biasScore(L){
  if (!L) return { dir:"NEUTRAL", score:50, raw:0 };
  const { close, ema20, rsi14, stochK, stochD } = L;
  const nEMA = (close!=null && ema20!=null) ? clamp((close-ema20)/ema20/0.03,-1,1) : 0;
  const nRSI = rsi14!=null ? clamp((rsi14-50)/25, -1, 1) : 0;
  const nSto = (stochK!=null && stochD!=null) ? clamp((stochK-stochD)/50,-1,1) : 0;
  const bp   = bandPos(L); const nBB = bp==null ? 0 : clamp((bp-50)/30, -1, 1);
  const raw  = clamp(0.35*nEMA + 0.30*nRSI + 0.20*nSto + 0.15*nBB, -1, 1);
  const score= Math.round((raw+1)*50);
  const dir  = raw>0.08 ? "LONG" : raw<-0.08 ? "SHORT" : "NEUTRAL";
  return { dir, score, raw };
}
function riskLabel(L){
  const c=L?.close, atr=L?.atr14;
  if (c&&atr){
    const p=atr/c;
    if (p<0.008) return {txt:"Düşük", color:"#22d39a"};
    if (p<0.02)  return {txt:"Orta",  color:"#f1c40f"};
    return {txt:"Yüksek", color:"#ff6b6b"};
  }
  const bu=L?.bbUpper, bl=L?.bbLower;
  if (c&&bu!=null&&bl!=null){
    const w=(bu-bl)/c;
    if (w<0.01) return {txt:"Düşük", color:"#22d39a"};
    if (w<0.03) return {txt:"Orta",  color:"#f1c40f"};
    return {txt:"Yüksek", color:"#ff6b6b"};
  }
  return {txt:"—", color:"#9aa4b2"};
}

/* ===== ATR fallback (EMA-ATR, HL yoksa close’tan da hesaplar) ===== */
function ema(prev, value, k){ return prev==null ? value : prev + k*(value-prev); }
function computeATR14FromSeries(rows){
  if (!rows?.length) return null;
  const n=14, k=2/(n+1);
  let prevClose = rows[0]?.close ?? rows[0]?.c ?? 0;
  let atr=null;
  for (let i=1;i<rows.length;i++){
    const h = Number(rows[i].high ?? rows[i].h ?? rows[i].close ?? rows[i].c ?? prevClose);
    const l = Number(rows[i].low  ?? rows[i].l ?? rows[i].close ?? rows[i].c ?? prevClose);
    const c = Number(rows[i].close?? rows[i].c ?? prevClose);
    const tr = Math.max(h-l, Math.abs(h-prevClose), Math.abs(l-prevClose));
    atr = ema(atr, tr, k);
    prevClose = c;
  }
  return atr;
}

/* ===== Plan / Pozisyon ===== */
const DEFAULT_ATR_K = 1.5;
function calcPlan(dir, L, atrK=DEFAULT_ATR_K, atrSeriesATR=null){
  const c=L?.close; if(!c) return null;
  let dist=null;
  if (L?.atr14) dist = atrK*L.atr14;
  if (dist==null && L?.bbUpper!=null && L?.bbLower!=null){
    const w = L.bbUpper - L.bbLower;
    if (w>0) dist = 0.25*w; // bandın 1/4’ü
  }
  if (dist==null && atrSeriesATR){ dist = atrK*atrSeriesATR; }
  if (!dist || dist<=0) return null;
  const entry=c;
  if (dir==="LONG"){
    const sl=entry-dist, tp1=entry+1*dist, tp2=entry+2*dist, tp3=entry+3*dist;
    return { entry, sl, tp1, tp2, tp3, r:dist };
  }else if (dir==="SHORT"){
    const sl=entry+dist, tp1=entry-1*dist, tp2=entry-2*dist, tp3=entry-3*dist;
    return { entry, sl, tp1, tp2, tp3, r:dist };
  }
  return null;
}
function positionSize(usd, riskPct, r){
  if (!usd||!riskPct||!r||r<=0) return 0;
  const riskUsd = usd*(riskPct/100);
  return riskUsd / r;
}

/* ===== Geçmiş başarı (localStorage) ===== */
const HIST_KEY = "kgz_sig_hist_v1";
function loadHist(){ try{ return JSON.parse(localStorage.getItem(HIST_KEY)||"[]"); }catch{ return []; } }
function saveHist(arr){ try{ localStorage.setItem(HIST_KEY, JSON.stringify(arr.slice(-200))); }catch{} }
function histStatsFor(sym){
  const arr = loadHist().filter(x=>x.sym===sym);
  const total = arr.length; if(!total) return {total:0,tpHits:0,slHits:0,rate:0};
  const tpHits = arr.filter(x=>x.resolved && x.resolved.startsWith("TP")).length;
  const slHits = arr.filter(x=>x.resolved==="SL").length;
  return { total, tpHits, slHits, rate: Math.round((tpHits/total)*100) };
}

/* ===== API ===== */
async function getLatest(symbol, interval){
  try{
    const r = await fetch(`/api/futures/indicators?symbol=${symbol}&interval=${interval}&limit=220`,{cache:"no-store"});
    const j = await r.json(); return j?.latest || null;
  }catch{ return null; }
}
async function getSeries(symbol, interval, limit=220){
  try{
    const r = await fetch(`/api/futures/indicators?symbol=${symbol}&interval=${interval}&limit=${limit}`,{cache:"no-store"});
    const j = await r.json(); return Array.isArray(j?.rows) ? j.rows : [];
  }catch{ return []; }
}
async function getMetrics(symbol){
  try{
    const r = await fetch(`/api/futures/metrics?symbol=${symbol}&lookback=15m`,{cache:"no-store"});
    const j = await r.json();
    return { oiChangePct:Number(j?.oiChangePct)||0, fundingRate:Number(j?.fundingRate)||0, whaleNetflowUsd:Number(j?.whaleNetflowUsd)||0 };
  }catch{ return { oiChangePct:0, fundingRate:0, whaleNetflowUsd:0 }; }
}

/* ===== Sayfa ===== */
export default function PanelSinyal(){
  const router = useRouter();

  /* Access */
  const [authOk, setAuthOk] = useState(false);
  useEffect(()=>{
    if (typeof window==="undefined") return;
    let u=null; try{ u=JSON.parse(localStorage.getItem("kgz_user")||"null"); }catch{}
    if (!u?.role || !ALLOWED_ROLES.has(u.role)) router.replace("/login?next=/panel-sinyal");
    else setAuthOk(true);
  },[router]);

  /* Semboller (backend’den dene, yoksa fallback liste) */
  const [symbols,setSymbols] = useState([]);
  useEffect(()=>{
    async function loadSymbols(){
      try{
        const r = await fetch("/api/futures/symbols?quote=USDT",{cache:"no-store"});
        const j = await r.json();
        const list = (j?.symbols||j||[]).filter(s=>typeof s==="string" && s.endsWith("USDT"));
        if (list.length) { setSymbols(list); return; }
      }catch{}
      setSymbols([
        "BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","LINKUSDT","TRXUSDT","MATICUSDT",
        "DOTUSDT","AVAXUSDT","OPUSDT","ARBUSDT","TONUSDT","ATOMUSDT","APTUSDT","FILUSDT","NEARUSDT","SUIUSDT",
        "AAVEUSDT","INJUSDT","PEPEUSDT","BCHUSDT","LTCUSDT","UNIUSDT","ETCUSDT","ICPUSDT","JUPUSDT","RUNEUSDT",
        "TIAUSDT","SEIUSDT","BLURUSDT","GALAUSDT","SANDUSDT","SHIBUSDT","FTMUSDT","WIFUSDT","RNDRUSDT","WLDUSDT",
      ]);
    }
    if (authOk) loadSymbols();
  },[authOk]);

  /* WS canlı fiyat */
  const [wsTicks,setWsTicks] = useState({});
  useEffect(()=>{
    if(!symbols.length) return;
    const sockets=[]; const batch=100;
    for(let i=0;i<symbols.length;i+=batch){
      const pack=symbols.slice(i,i+batch);
      const url=`wss://fstream.binance.com/stream?streams=${pack.map(s=>`${s.toLowerCase()}@miniTicker`).join("/")}`;
      const ws=new WebSocket(url);
      ws.onmessage=(ev)=>{
        try{
          const d=JSON.parse(ev.data)?.data; if(!d?.s) return;
          const last = d?.c ? +d.c : null;
          const chg  = d?.P!==undefined ? +d.P : (d?.o&&d?.c) ? ((+d.c - +d.o)/+d.o)*100 : null;
          setWsTicks(p=>({...p,[d.s]:{last,chg}}));
        }catch{}
      };
      sockets.push(ws);
    }
    return ()=> sockets.forEach(w=>{try{w.close();}catch{}});
  },[symbols]);

  /* Kontroller – gevşek varsayılanlar */
  const [mode,setMode] = useState("intraday");
  const [use3m,setUse3m] = useState(true);
  const [use30m,setUse30m] = useState(true);
  const [use4h,setUse4h] = useState(false);

  const activeIntervals = useMemo(()=>{
    const base = mode==="intraday" ? ["5m","15m","1h"] : ["1m","5m"];
    if (use3m && !base.includes("3m")) base.splice(1,0,"3m");
    if (use30m&& !base.includes("30m")) base.push("30m");
    if (use4h && !base.includes("4h")) base.push("4h");
    return base;
  },[mode,use3m,use30m,use4h]);

  const [potIv,setPotIv] = useState("12h");
  const [minPot,setMinPot] = useState(0.15); // ≥%15
  const [sameDir,setSameDir] = useState(false); // GEVŞEK
  const [useRegime,setUseRegime] = useState(true);
  const [useSqueeze,setUseSqueeze] = useState(false); // GEVŞEK
  const [sqThresh,setSqThresh] = useState(0.012);

  const [useWhale,setUseWhale] = useState(true);
  const [useOI,setUseOI] = useState(true);
  const [useFunding,setUseFunding] = useState(true);

  const [capital,setCapital] = useState(100); // USDT
  const [riskPct,setRiskPct] = useState(0.5); // %
  const [atrK,setAtrK] = useState(DEFAULT_ATR_K);
  const [timeStopMin,setTimeStopMin] = useState(60);

  const [easyMode,setEasyMode] = useState(true);
  const [easyApplied,setEasyApplied] = useState(false);
  const [helpOpen,setHelpOpen] = useState(false);

  const [onlyFavs,setOnlyFavs] = useState(false);
  const [favs,setFavs] = useState([]);
  useEffect(()=>{ try{ const arr=JSON.parse(localStorage.getItem("kgz_favs")||"[]"); if(Array.isArray(arr)) setFavs(arr);}catch{} },[]);
  useEffect(()=>{ try{ localStorage.setItem("kgz_favs", JSON.stringify(favs)); }catch{} },[favs]);
  const favSet = useMemo(()=>new Set(favs),[favs]);

  const [refreshMs,setRefreshMs] = useState(10000);
  const [lastRunAt,setLastRunAt] = useState(null);
  const [stats,setStats] = useState({scanned:0, keptStrict:0, keptEasy:0, missingBB:0});

  const [loading,setLoading] = useState(false);
  const [rows,setRows] = useState([]);

  /* TARAMA */
  async function scanOnce(params, counters){
    const { potIvX, minPotX, sameDirX, useRegimeX, useSqueezeX, sqThreshX } = params;
    const list = symbols.filter(s=>!onlyFavs || favSet.has(s));
    const tasks = list.map(async (sym)=>{
      counters.scanned++;

      // 1) verileri topla
      const reqs = [
        getLatest(sym, potIvX),
        ...activeIntervals.map(iv=>getLatest(sym,iv)),
        getLatest(sym,"15m"), // atr referansı
        (useWhale||useOI||useFunding) ? getMetrics(sym) : Promise.resolve({oiChangePct:0,fundingRate:0,whaleNetflowUsd:0})
      ];
      const res = await Promise.all(reqs);
      const Lpot = res[0];
      const frames = {}; activeIntervals.forEach((iv,i)=>frames[iv]=res[i+1]);
      const atrRef = res[1+activeIntervals.length];
      const metrics = res[2+activeIntervals.length] || {oiChangePct:0,fundingRate:0,whaleNetflowUsd:0};

      // 2) yön/ skor
      let w=0, s=0;
      const weight = {"3m":0.5,"5m":0.5,"15m":0.7,"30m":0.6,"1h":0.8,"4h":0.5};
      for(const [iv,L] of Object.entries(frames)){
        if(!L) continue;
        const bs=biasScore(L); s+=bs.raw*(weight[iv]||0.5); w+=(weight[iv]||0.5);
      }
      const raw = w? s/w : 0;
      const dir = raw>0.08?"LONG": raw<-0.08?"SHORT":"NEUTRAL";
      const score = Math.round((clamp(raw,-1,1)+1)*50);
      if (dir==="NEUTRAL") return null;

      // 3) MTF aynı yön
      if (sameDirX){
        const signs = activeIntervals.map(iv=>{
          const bs = frames[iv] ? biasScore(frames[iv]) : null;
          return bs ? (bs.raw>0?1:bs.raw<0?-1:0) : 0;
        }).filter(x=>x!==0);
        if (signs.length && !signs.every(x=>x===signs[0])) return null;
      }

      // 4) rejim & sıkışma
      if (useRegimeX){
        const L15=frames["15m"], L1h=frames["1h"];
        if (dir==="LONG"){
          if (L15 && !(L15.close>L15.ema20)) return null;
          if (L1h && !(L1h.close>L1h.ema20)) return null;
        }else{
          if (L15 && !(L15.close<L15.ema20)) return null;
          if (L1h && !(L1h.close<L1h.ema20)) return null;
        }
      }
      if (useSqueezeX){
        const L = frames["15m"] || frames["30m"] || frames["5m"];
        const c=L?.close, bu=L?.bbUpper, bl=L?.bbLower;
        const bw = (c&&bu!=null&&bl!=null) ? (bu-bl)/c : null;
        if (bw==null || !(bw <= sqThreshX)) return null;
      }

      // 5) potansiyel (BB veya ATR)
      const c = Lpot?.close ?? frames["15m"]?.close ?? frames["1h"]?.close;
      let potPct = null; let potSource="BB";
      const upBB   = (Lpot?.bbUpper!=null && c) ? (Lpot.bbUpper - c)/c : null;
      const downBB = (Lpot?.bbLower!=null && c) ? (c - Lpot.bbLower)/c : null;

      // ATR fallback (seriden)
      let atr = atrRef?.atr14 || null;
      let atr15mSeries=null;
      if (!atr){
        atr15mSeries = await getSeries(sym,"15m",200);
        const calc = computeATR14FromSeries(atr15mSeries);
        if (calc) atr = calc;
      }

      if (dir==="LONG"){
        if (upBB!=null) potPct = upBB*100;
        else if (atr && c){ potPct = (atr*2)/c*100; potSource="ATR"; }
      }else{
        if (downBB!=null) potPct = downBB*100;
        else if (atr && c){ potPct = (atr*2)/c*100; potSource="ATR"; }
      }
      if (potPct==null || potPct < minPotX*100) return null;

      // 6) teyit (küçük katkı)
      let confBoost=0; const notes=[];
      if (useWhale && metrics.whaleNetflowUsd){
        if (dir==="LONG" && metrics.whaleNetflowUsd>0){ confBoost+=0.1; notes.push("Whale↑"); }
        if (dir==="SHORT"&& metrics.whaleNetflowUsd<0){ confBoost+=0.1; notes.push("Whale↓"); }
      }
      if (useOI && metrics.oiChangePct>0){ confBoost+=0.1; notes.push(`OI ${fmt(metrics.oiChangePct,1)}%`); }
      if (useFunding && metrics.fundingRate){
        const f=metrics.fundingRate;
        if (dir==="LONG" && f<0){ confBoost+=0.05; notes.push(`Funding ${fmt(f*100,3)}%`); }
        if (dir==="SHORT"&& f>0){ confBoost+=0.05; notes.push(`Funding ${fmt(f*100,3)}%`); }
      }
      const scoreAdj = Math.round( clamp((score/100)*0.9 + confBoost*0.1, 0, 1)*100 );

      // 7) plan (ATR/BB/series)
      const Lref = frames["15m"] || frames["30m"] || frames["1h"] || Lpot;
      const plan = calcPlan(dir, Lref, atrK, atr);

      // 8) risk etiketi
      const risk = riskLabel(Lref);

      // 9) neden özeti
      const why=[];
      for (const iv of ["3m","5m","15m","30m","1h","4h"]){
        const L=frames[iv]; if(!L) continue;
        const bs=biasScore(L);
        if (bs.dir!=="NEUTRAL") why.push(`${iv} ${bs.dir} (sk=${bs.score})`);
      }
      if (notes.length) why.push(notes.join("/"));
      const reasons = why.slice(0,6).join(" • ");

      return {
        sym:sym,
        dir:dir,
        score:scoreAdj,
        potPct:Math.round(potPct),
        potSource,
        price: wsTicks[sym]?.last ?? Lref?.close ?? c ?? null,
        reasons,
        entry: plan?.entry, sl: plan?.sl, tp1: plan?.tp1, tp2: plan?.tp2, tp3: plan?.tp3,
        r: plan?.r,
        risk,
      };
    });

    const out = (await Promise.all(tasks)).filter(Boolean).sort((a,b)=> (b.score-a.score) || (b.potPct-a.potPct));
    return out;
  }

  async function doScan(){
    setLoading(true); setEasyApplied(false);
    const counters={scanned:0, keptStrict:0, keptEasy:0, missingBB:0};
    try{
      const strict = await scanOnce(
        { potIvX:potIv, minPotX:minPot, sameDirX:sameDir, useRegimeX:useRegime, useSqueezeX:useSqueeze, sqThreshX:sqThresh },
        counters
      );
      counters.keptStrict = strict.length;
      if (strict.length>0 || !easyMode){
        setRows(strict);
      }else{
        const easy = await scanOnce(
          { potIvX:potIv, minPotX:Math.min(minPot,0.10), sameDirX:false, useRegimeX:useRegime, useSqueezeX:false, sqThreshX:sqThresh },
          counters
        );
        counters.keptEasy = easy.length;
        setRows(easy);
        setEasyApplied(true);
      }
    } finally {
      setStats(counters); setLastRunAt(new Date()); setLoading(false);
    }
  }

  /* Otomatik yenile */
  useEffect(()=>{
    if(!authOk || !symbols.length) return;
    const t=setInterval(doScan, refreshMs);
    doScan();
    return ()=> clearInterval(t);
  },[
    authOk,symbols,refreshMs,mode,use3m,use30m,use4h,potIv,minPot,sameDir,useRegime,useSqueeze,sqThresh,
    easyMode,useWhale,useOI,useFunding,atrK,capital,riskPct,onlyFavs
  ]);

  /* WS: aktif satırlar için TP/SL izleme */
  const watchers = useRef({});
  useEffect(()=>{
    Object.values(watchers.current).forEach(w=>{try{w.sock&&w.sock.close();}catch{}});
    watchers.current={};
    rows.forEach(r=>{
      if (!r?.sym || !r?.entry || !r?.sl || !r?.tp1) return;
      const url=`wss://fstream.binance.com/ws/${r.sym.toLowerCase()}@miniTicker`;
      const sock=new WebSocket(url);
      const state={sock, resolved:false};
      sock.onmessage=(ev)=>{
        if (state.resolved) return;
        try{
          const d=JSON.parse(ev.data); const c=d?.c?+d.c:null; if(!c) return;
          if (r.dir==="LONG"){
            if (c<=r.sl){ state.resolved=true; markResolved(r.sym,"SL",r); }
            else if (c>=r.tp3){ state.resolved=true; markResolved(r.sym,"TP3",r); }
            else if (c>=r.tp2){ markFloating(r.sym,"TP2",r); }
            else if (c>=r.tp1){ markFloating(r.sym,"TP1",r); }
          }else{
            if (c>=r.sl){ state.resolved=true; markResolved(r.sym,"SL",r); }
            else if (c<=r.tp3){ state.resolved=true; markResolved(r.sym,"TP3",r); }
            else if (c<=r.tp2){ markFloating(r.sym,"TP2",r); }
            else if (c<=r.tp1){ markFloating(r.sym,"TP1",r); }
          }
        }catch{}
      };
      watchers.current[r.sym]=state;
    });
    function markFloating(sym,level,row){
      const hist=loadHist();
      const idx=hist.findIndex(h=>!h.resolved && h.sym===sym && Math.abs(Date.now()-h.ts)<12*60*60*1000);
      if (idx<0) hist.push({sym,ts:Date.now(),dir:row.dir,entry:row.entry,sl:row.sl,tp1:row.tp1,tp2:row.tp2,tp3:row.tp3,resolved:null,float:level});
      else hist[idx].float=level;
      saveHist(hist);
    }
    function markResolved(sym,tag,row){
      const hist=loadHist();
      const idx=hist.findIndex(h=>!h.resolved && h.sym===sym && Math.abs(Date.now()-h.ts)<12*60*60*1000);
      if (idx<0) hist.push({sym,ts:Date.now(),dir:row.dir,entry:row.entry,sl:row.sl,tp1:row.tp1,tp2:row.tp2,tp3:row.tp3,resolved:tag});
      else hist[idx].resolved=tag;
      saveHist(hist);
    }
    return ()=>{
      Object.values(watchers.current).forEach(w=>{try{w.sock&&w.sock.close();}catch{}});
      watchers.current={};
    };
  },[rows]);

  if (!authOk) return <main style={{padding:16}}><div style={{opacity:.7}}>Yetki doğrulanıyor…</div></main>;
  if (!symbols.length) return <main style={{padding:16}}><div style={{opacity:.7}}>Semboller yükleniyor…</div></main>;

  /* UI: açıklama metinleri */
  const SCORE_EXPL = "Skor 0–100: 80–100 güçlü, 60–80 orta, 40–60 zayıf. MTF birleşik ağırlıklarla (3m/5m/15m/30m/1h/4h) hesaplanır.";
  const SRC_EXPL   = "Kaynak: BB (Bollinger hedefi), MTF (çoklu zaman uyumu), ATR (volatilite mesafesi). Whale/OI/Funding teyit amaçlı küçük katkı ekler.";

  return (
    <main style={{minHeight:"100vh", background:"#0f1320", color:"#e6f0ff", padding:"16px 18px", paddingBottom:72}}>
      {/* NAV */}
      <nav style={{display:"flex",gap:16,alignItems:"center",marginBottom:12,flexWrap:"wrap"}}>
        <button onClick={()=> (history.length>1 ? history.back() : router.push("/"))}
                style={btnSm} type="button">← Geri</button>
        <Link href="/" style={{color:"#8bd4ff",fontWeight:900,fontSize:18,textDecoration:"none"}}>Kripto Gözü</Link>
        <Link href="/" style={navL}>Ana Sayfa</Link>
        <Link href="/panel" style={navL}>Panel</Link>
        <Link href="/whales" style={navL}>Balina</Link>
        <Link href="/balina2d" style={navL}>Balina2D</Link>
        <span style={{marginLeft:"auto",display:"flex",gap:10,alignItems:"center"}}>
          <label style={lbl}><input type="checkbox" checked={easyMode} onChange={e=>setEasyMode(e.target.checked)}/> Kolay Mod</label>
          <button onClick={()=>setHelpOpen(v=>!v)} style={{...btnSm,padding:"6px 10px"}} type="button">?</button>
          <label style={lbl}>
            Hız
            <select value={String(refreshMs)} onChange={e=>setRefreshMs(Number(e.target.value))} style={sel}>
              <option value="5000">5s</option>
              <option value="10000">10s</option>
              <option value="20000">20s</option>
            </select>
          </label>
        </span>
      </nav>

      <h1 style={{marginTop:0,display:"flex",alignItems:"center",gap:10}}>
        Panel – Sinyal (PRO)
        <span style={{width:10,height:10,borderRadius:99,background:"#22d39a"}} />
        <span style={{fontSize:12,opacity:.75}}>
          Tarandı: <b>{stats.scanned}</b> • Geçen(str.): <b>{stats.keptStrict}</b> • Geçen(easy): <b>{stats.keptEasy}</b> • Son: {lastRunAt? lastRunAt.toLocaleTimeString():"—"}
        </span>
        {easyApplied && <span style={{marginLeft:8,padding:"3px 8px",borderRadius:8,border:"1px solid #314466",background:"#142235",color:"#9bd0ff",fontSize:12,fontWeight:800}}>Kolay Mod devrede</span>}
      </h1>

      {/* Kontroller */}
      <div style={{border:"1px solid #1f2742",borderRadius:12,padding:"10px 12px",marginBottom:12,background:"#0e1426"}}>
        <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",margin:"6px 0"}}>
          <label style={lbl}>
            Mod
            <select value={mode} onChange={e=>setMode(e.target.value)} style={sel}>
              <option value="intraday">Gün-İçi (5m+15m+1h)</option>
              <option value="scalper">Scalper (1m+5m)</option>
            </select>
          </label>
          <label style={lbl}><input type="checkbox" checked={use3m} onChange={e=>setUse3m(e.target.checked)}/> 3m</label>
          <label style={lbl}><input type="checkbox" checked={use30m} onChange={e=>setUse30m(e.target.checked)}/> 30m</label>
          <label style={lbl}><input type="checkbox" checked={use4h} onChange={e=>setUse4h(e.target.checked)}/> 4h</label>

          <label style={lbl}>
            Pot. Çerçeve
            <select value={potIv} onChange={e=>setPotIv(e.target.value)} style={sel}>
              <option value="12h">12h</option>
              <option value="1d">1D</option>
            </select>
          </label>

          <label style={lbl}>
            Min Potansiyel
            <select value={String(minPot)} onChange={e=>setMinPot(Number(e.target.value))} style={sel}>
              <option value="0.10">≥ %10</option>
              <option value="0.15">≥ %15</option>
              <option value="0.20">≥ %20</option>
              <option value="0.30">≥ %30</option>
            </select>
          </label>

          <label style={lbl}><input type="checkbox" checked={sameDir} onChange={e=>setSameDir(e.target.checked)}/> MTF aynı yön</label>
          <label style={lbl}><input type="checkbox" checked={useRegime} onChange={e=>setUseRegime(e.target.checked)}/> Rejim filtresi</label>
          <label style={lbl}><input type="checkbox" checked={useSqueeze} onChange={e=>setUseSqueeze(e.target.checked)}/> Sıkışma</label>
          <label style={lbl}>
            BB genişlik
            <select value={String(sqThresh)} onChange={e=>setSqThresh(Number(e.target.value))} style={sel}>
              <option value="0.008">≤ 0.8%</option>
              <option value="0.012">≤ 1.2%</option>
              <option value="0.018">≤ 1.8%</option>
            </select>
          </label>

          <label style={lbl}><input type="checkbox" checked={useWhale} onChange={e=>setUseWhale(e.target.checked)}/> Whale</label>
          <label style={lbl}><input type="checkbox" checked={useOI} onChange={e=>setUseOI(e.target.checked)}/> OI</label>
          <label style={lbl}><input type="checkbox" checked={useFunding} onChange={e=>setUseFunding(e.target.checked)}/> Funding</label>

          <label style={lbl}>Sermaye
            <input type="number" value={capital} onChange={e=>setCapital(Number(e.target.value)||0)} style={{...sel,width:110}}/>
          </label>
          <label style={lbl}>Risk %
            <input type="number" step="0.1" value={riskPct} onChange={e=>setRiskPct(Number(e.target.value)||0)} style={{...sel,width:90}}/>
          </label>
          <label style={lbl}>ATR k
            <select value={String(atrK)} onChange={e=>setAtrK(Number(e.target.value))} style={sel}>
              <option value="1.0">1.0</option><option value="1.25">1.25</option>
              <option value="1.5">1.5</option><option value="2.0">2.0</option>
            </select>
          </label>
          <label style={lbl}>Time-Stop
            <select value={String(timeStopMin)} onChange={e=>setTimeStopMin(Number(e.target.value))} style={sel}>
              <option value="30">30 dk</option><option value="60">60 dk</option><option value="90">90 dk</option>
            </select>
          </label>

          <label style={lbl}><input type="checkbox" checked={onlyFavs} onChange={e=>setOnlyFavs(e.target.checked)}/> Sadece Favoriler</label>
          <button onClick={doScan} disabled={loading} style={btnPrimary}>{loading?"Taranıyor…":"Yenile"}</button>
        </div>
      </div>

      {/* Açıklamalar */}
      {helpOpen && (
        <div style={{border:"1px solid #25304a",background:"#101a30",borderRadius:10,padding:12,marginBottom:12,fontSize:13,lineHeight:1.5}}>
          <b>Kolay Mod</b>: Sinyal çıkmazsa filtreleri otomatik gevşetir (min potansiyeli düşürür, MTF zorunluluğunu kaldırır, sıkışmayı kapatır).<br/>
          <b>Skor</b>: {SCORE_EXPL}<br/>
          <b>Kaynak</b>: {SRC_EXPL}<br/>
          <b>Entry/SL/TP</b>: BB yoksa 15m seriden ATR hesaplanır; ATR×k ile SL, 1-2-3R TP yazılır. Time-Stop {timeStopMin} dk.<br/>
          <b>Önerilen Poz.</b>: (Sermaye × Risk%) / (Entry–SL). Futures kaldıraç kullanıyorsan, gösterge kontrat adetini eşler.<br/>
          <b>Başarı %</b>: Gösterilen sinyaller TP/SL'e dokununca yerel olarak işaretlenir (tarayıcıda saklanır). Hard refresh sonrası da görünür.
        </div>
      )}

      {/* BAŞLIK */}
      <div style={{
        display:"grid",
        gridTemplateColumns:"1.15fr 0.7fr 0.7fr 0.9fr 2.4fr 2.4fr 1.2fr 0.9fr",
        padding:"10px 12px", background:"#0e1424",
        border:"1px solid #1f2742", borderRadius:"12px 12px 0 0",
        color:"#a9b4c9", fontWeight:800
      }}>
        <div>Coin</div>
        <div>Yön</div>
        <div title="Skor 0–100. 80–100 güçlü, 60–80 orta, 40–60 zayıf.">Skor ⓘ</div>
        <div>Başarı %</div>
        <div>Neden (kısa özet)</div>
        <div>Entry • SL • TP1/2/3</div>
        <div>Önerilen Poz.</div>
        <div title="BB: Bollinger • MTF: çoklu zaman uyumu • ATR: volatilite">Kaynak ⓘ</div>
      </div>

      {/* LİSTE */}
      <div style={{border:"1px solid #1f2742", borderTop:"none", borderRadius:"0 0 12px 12px", overflow:"hidden"}}>
        {rows.length===0 && (
          <div style={{padding:"12px 14px", opacity:.75}}>Şu an kriterlere uyan sinyal yok. Filtreleri gevşetip tekrar dene.</div>
        )}

        {rows.map((r,i)=>{
          const price = wsTicks[r.sym]?.last ?? r.price ?? r.entry ?? null;
          const chg   = wsTicks[r.sym]?.chg ?? null;
          const plan  = r.entry ? r : null;
          const pos   = plan ? positionSize(capital, riskPct, r.r) : 0;
          const fav   = favSet.has(r.sym);
          const hs    = histStatsFor(r.sym);

          return (
            <div key={r.sym} style={{
              display:"grid",
              gridTemplateColumns:"1.15fr 0.7fr 0.7fr 0.9fr 2.4fr 2.4fr 1.2fr 0.9fr",
              padding:"12px",
              borderTop: i===0 ? "none" : "1px solid #1f2742",
              alignItems:"center",
              background: i%2 ? "#0f1329" : "#0e1226"
            }}>
              {/* Coin */}
              <div style={{display:"flex",alignItems:"center",gap:10,overflow:"hidden"}}>
                <button onClick={()=> setFavs(p=> fav ? p.filter(x=>x!==r.sym) : [...p,r.sym])}
                        title={fav?"Favoriden çıkar":"Favorilere ekle"}
                        style={{background:"transparent",border:"none",cursor:"pointer",fontSize:18,lineHeight:1}}>{fav?"★":"☆"}</button>
                <Link href={`/coin/${r.sym}`} style={{color:"#8bd4ff",fontWeight:900,textDecoration:"none",whiteSpace:"nowrap"}}>{r.sym}</Link>
                <span style={{opacity:.65,whiteSpace:"nowrap",fontSize:12}}>
                  @ {fmtPrice(price)} {chg!=null && <b style={{color: chg>=0?"#22d39a":"#ff6b6b"}}>{pctTxt(chg)}</b>}
                </span>
              </div>

              {/* Yön */}
              <div style={{fontWeight:900,color:r.dir==="LONG"?"#22d39a":"#ff6b6b"}}>{r.dir}</div>

              {/* Skor */}
              <div>{fmt(r.score,0)}</div>

              {/* Başarı % */}
              <div title={`Son ${hs.total} sinyal • TP:${hs.tpHits} / SL:${hs.slHits}`}>{hs.rate? `${hs.rate}%` : "—"}</div>

              {/* Neden */}
              <div style={{opacity:.92, overflow:"hidden", textOverflow:"ellipsis"}}>{r.reasons}{r.potPct!=null && <span style={{opacity:.6}}> • Pot: ~{r.potPct}%</span>}</div>

              {/* Entry/SL/TP */}
              <div style={{fontSize:13}}>
                {plan
                  ? (<span>
                      Entry <b>{fmtPrice(r.entry)}</b> • SL <b>{fmtPrice(r.sl)}</b> •
                      TP1 <b>{fmtPrice(r.tp1)}</b> / TP2 <b>{fmtPrice(r.tp2)}</b> / TP3 <b>{fmtPrice(r.tp3)}</b>
                      <span style={{opacity:.6}}> • ATR×{fmt(atrK,2)} • TS {timeStopMin}dk</span>
                    </span>)
                  : (<span style={{opacity:.6}}>ATR/BB yetersiz — plan hesaplanamadı</span>)
                }
              </div>

              {/* Önerilen Poz. */}
              <div style={{fontSize:13}}>
                {plan
                  ? (pos>0
                      ? <span>Boyut: <b>{fmt(pos,3)}</b> adet • Risk: ~<b>{fmt(capital*(riskPct/100),2)} USDT</b> • <span style={{color:r.risk?.color}}>{r.risk?.txt||"—"}</span></span>
                      : <span style={{opacity:.6}}>Sermaye/Risk/ATR yetersiz</span>)
                  : <span style={{opacity:.6}}>Plan yok</span>
                }
              </div>

              {/* Kaynak */}
              <div style={{opacity:.9}}>{r.potSource==="BB"?"BB":"ATR"}, MTF</div>
            </div>
          );
        })}
      </div>

      <p style={{opacity:.6,marginTop:10,fontSize:12}}>
        Kaynak: Binance Futures (miniTicker WS + MTF indicators + {potIv.toUpperCase()} potansiyel). Bilgi amaçlıdır, yatırım tavsiyesi değildir.
      </p>
    </main>
  );
}

/* ===== stiller ===== */
const navL = { color:"#d0d6e6", textDecoration:"none" };
const lbl  = { display:"inline-flex", alignItems:"center", gap:8, padding:"6px 10px", border:"1px solid #2a2f45", background:"#121625", borderRadius:8 };
const sel  = { padding:"6px 8px", background:"#0f1320", border:"1px solid #23283b", borderRadius:8, color:"#e6e6e6" };
const btnSm= { padding:"6px 10px", background:"#1a1f2e", border:"1px solid #2a2f45", borderRadius:8, color:"#fff", cursor:"pointer" };
const btnPrimary = { padding:"8px 12px", background:"#1a1f2e", border:"1px solid #2a2f45", borderRadius:10, color:"#fff", fontWeight:800, cursor:"pointer" };
