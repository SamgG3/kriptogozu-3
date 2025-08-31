// pages/panel-sinyal.js
import React, { useEffect, useMemo, useRef, useState } from "react";
// risk helper (tek satır)
import { entryAllowed, stopsAndTargets, nextTrailSL } from "../lib/risk-tools";
import Link from "next/link";
import { useRouter } from "next/router";

/* ===== Roller (Kurucu / Yönetici / Arkadaş) ===== */
const ALLOWED_ROLES = new Set(["kurucu","yonetici","arkadas"]);

/* ===== Helpers ===== */
const clamp = (x,min,max)=> Math.max(min, Math.min(max,x));
const fmt = (v,d=2)=> v==null||isNaN(v) ? "—" :
  Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d, maximumFractionDigits:d});
const fmtPrice = (v)=>{
  if (v==null||isNaN(v)) return "—";
  const a=Math.abs(v); const d = a>=100?2 : a>=1?4 : 6;
  return Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d, maximumFractionDigits:d});
};
const pctTxt = (v)=> v==null||isNaN(v) ? "—" : (v>=0?"+":"")+Number(v).toFixed(2)+"%";

/* ===== Bias / Risk ===== */
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
  const dir  = raw>0.06 ? "LONG" : raw<-0.06 ? "SHORT" : "NEUTRAL";
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

/* ===== ATR / ADX / Divergence ===== */
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
// Wilder ADX(14) – high/low yoksa null döner
function computeADX14(series){
  if (!Array.isArray(series) || series.length<20) return null;
  const H = (i)=> Number(series[i].high ?? series[i].h ?? NaN);
  const L = (i)=> Number(series[i].low  ?? series[i].l ?? NaN);
  const C = (i)=> Number(series[i].close?? series[i].c ?? NaN);
  for(let i=0;i<series.length;i++){
    if (isNaN(H(i))||isNaN(L(i))||isNaN(C(i))) return null;
  }
  const n=14;
  let tr14=0, plusDM14=0, minusDM14=0;
  for(let i=1;i<=n;i++){
    const up = H(i)-H(i-1);
    const dn = L(i-1)-L(i);
    const plusDM = (up>dn && up>0)? up : 0;
    const minusDM= (dn>up && dn>0)? dn : 0;
    const tr = Math.max(H(i)-L(i), Math.abs(H(i)-C(i-1)), Math.abs(L(i)-C(i-1)));
    tr14 += tr; plusDM14 += plusDM; minusDM14 += minusDM;
  }
  let smTR=tr14, smPlus=plusDM14, smMinus=minusDM14;
  let adxVals=[];
  for(let i=n+1;i<series.length;i++){
    const tr = Math.max(H(i)-L(i), Math.abs(H(i)-C(i-1)), Math.abs(L(i)-C(i-1)));
    const up = H(i)-H(i-1);
    const dn = L(i-1)-L(i);
    const plusDM = (up>dn && up>0)? up : 0;
    const minusDM= (dn>up && dn>0)? dn : 0;
    smTR = smTR - (smTR/n) + tr;
    smPlus= smPlus - (smPlus/n) + plusDM;
    smMinus=smMinus- (smMinus/n)+ minusDM;
    const plusDI = smTR? (smPlus/smTR)*100 : 0;
    const minusDI= smTR? (smMinus/smTR)*100: 0;
    const dx = (plusDI+minusDI) ? Math.abs(plusDI - minusDI)/(plusDI+minusDI)*100 : 0;
    if (adxVals.length===0) adxVals.push(dx);
    else adxVals.push( (adxVals[adxVals.length-1]*13 + dx)/14 );
  }
  return adxVals.length? adxVals[adxVals.length-1] : null;
}
// RSI Divergence – basit tepe/dip
function detectRSIDivergence(series){
  const rsis = series.map(b=> Number(b.rsi14 ?? b.r ?? NaN)).filter(v=>!isNaN(v));
  const closes = series.map(b=> Number(b.close ?? b.c ?? NaN)).filter(v=>!isNaN(v));
  if (rsis.length<20 || closes.length<20) return null;
  const N=30; const r = rsis.slice(-N), p = closes.slice(-N);
  const hiIdx = (arr)=> arr.reduce((m,v,i)=> v>arr[m]? i : m, 0);
  const loIdx = (arr)=> arr.reduce((m,v,i)=> v<arr[m]? i : m, 0);
  const pHi1 = hiIdx(p.slice(0, Math.floor(N/2))); const pHi2 = hiIdx(p.slice(Math.floor(N/2)))+Math.floor(N/2);
  const rHi1 = hiIdx(r.slice(0, Math.floor(N/2))); const rHi2 = hiIdx(r.slice(Math.floor(N/2)))+Math.floor(N/2);
  const pLo1 = loIdx(p.slice(0, Math.floor(N/2))); const pLo2 = loIdx(p.slice(Math.floor(N/2)))+Math.floor(N/2);
  const rLo1 = loIdx(r.slice(0, Math.floor(N/2))); const rLo2 = loIdx(r.slice(Math.floor(N/2)))+Math.floor(N/2);
  const bearish = p[pHi2]>p[pHi1] && r[rHi2]<r[rHi1];
  const bullish = p[pLo2]<p[pLo1] && r[rLo2]>r[rLo1];
  if (bullish && !bearish) return "bullish";
  if (bearish && !bullish) return "bearish";
  return null;
}
// 24s Hacim (quote) – q varsa onu, yoksa v*close
function quoteVol24h(series){
  if (!Array.isArray(series)||!series.length) return null;
  const last96 = series.slice(-96);
  let sum=0;
  for (const b of last96){
    const q = Number(b.quoteVolume ?? b.q ?? NaN);
    if (!isNaN(q)) { sum+=q; continue; }
    const v = Number(b.volume ?? b.v ?? NaN);
    const c = Number(b.close ?? b.c ?? NaN);
    if (!isNaN(v) && !isNaN(c)) sum += v*c;
  }
  return sum>0 ? sum : null;
}
/* ===== S/R & Trend (15m) ===== */
function analyzeSRandTrend(series, ema20Latest){
  if (!Array.isArray(series) || series.length<20) return { sr:null, trend:"—" };
  const N=20;
  const slice = series.slice(-N);
  const highs = slice.map(b=> Number(b.high ?? b.h ?? b.close ?? b.c));
  const lows  = slice.map(b=> Number(b.low  ?? b.l ?? b.close ?? b.c));
  const closes= slice.map(b=> Number(b.close?? b.c));
  const lastClose = closes[closes.length-1];

  const swingsH=[], swingsL=[];
  for(let i=1;i<highs.length-1;i++){
    if (highs[i]>highs[i-1] && highs[i]>highs[i+1]) swingsH.push(highs[i]);
    if (lows[i] <lows[i-1]  && lows[i] <lows[i+1])  swingsL.push(lows[i]);
  }
  let nearRes = swingsH.filter(h=>h>lastClose).sort((a,b)=>a-b)[0] ?? null;
  let nearSup = swingsL.filter(l=>l<lastClose).sort((a,b)=>b-a)[0] ?? null;

  const prevMax = Math.max(...highs.slice(0,-1));
  const prevMin = Math.min(...lows.slice(0,-1));
  let trend="—";
  if (lastClose > prevMax && (ema20Latest==null || lastClose>ema20Latest)) trend="↑ kırılım";
  else if (lastClose < prevMin && (ema20Latest==null || lastClose<ema20Latest)) trend="↓ kırılım";

  return {
    sr: nearRes!=null || nearSup!=null
      ? { sup: nearSup, res: nearRes, distSup: nearSup!=null? (lastClose-nearSup)/lastClose*100 : null,
          distRes: nearRes!=null? (nearRes-lastClose)/lastClose*100 : null }
      : null,
    trend
  };
}

/* ===== Plan / Pozisyon ===== */
const DEFAULT_ATR_K = 1.5;
function calcPlan(dir, L, atrK=DEFAULT_ATR_K, atrSeriesATR=null){
  const c=L?.close; if(!c) return null;
  let dist=null;
  if (L?.atr14) dist = atrK*L.atr14;
  if (dist==null && L?.bbUpper!=null && L?.bbLower!=null){
    const w = L.bbUpper - L.bbLower;
    if (w>0) dist = 0.25*w;
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
// ✅ DÜZELTİLDİ: positionSize çağrısı artık capital üzerinden olacak
function positionSize(usd, riskPct, r){
  if (!usd||!riskPct||!r||r<=0) return 0;
  const riskUsd = usd*(riskPct/100);
  return riskUsd / r;
}

/* ===== RR hesap (S/R veya potansiyelden) ===== */
function rrFromSRorPot(dir, price, r, sr, potPct){
  if (!price || !r) return null;
  let rewardPx = null;
  if (dir==="LONG"){
    if (sr?.distRes!=null) rewardPx = price * (sr.distRes/100);
    else if (potPct!=null) rewardPx = price * (potPct/100);
  } else {
    if (sr?.distSup!=null) rewardPx = price * (sr.distSup/100);
    else if (potPct!=null) rewardPx = price * (potPct/100);
  }
  return rewardPx!=null ? rewardPx / r : null;
}

/* ===== Plan kilitleme + storage ===== */
const PLAN_KEY = "kgz_sig_plan_lock_v1";
function loadPlans(){ try{ return JSON.parse(localStorage.getItem(PLAN_KEY)||"{}"); }catch{ return {}; } }
function savePlans(obj){ try{ localStorage.setItem(PLAN_KEY, JSON.stringify(obj)); }catch{} }
function lockPlan(sym, dir, plan){
  if (!plan) return null;
  const all = loadPlans();
  const key = `${sym}:${dir}`;
  if (all[key]) return all[key];
  all[key] = {...plan, ts:Date.now()}; // ts: kilit zamanı
  savePlans(all);
  return all[key];
}
function getLockedPlan(sym, dir){
  const all = loadPlans();
  return all[`${sym}:${dir}`] || null;
}
function updateLockedPlan(sym, dir, patch){
  const all = loadPlans();
  const key = `${sym}:${dir}`;
  if (!all[key]) return;
  all[key] = {...all[key], ...patch};
  savePlans(all);
}
function clearPlan(sym){
  const all = loadPlans();
  Object.keys(all).forEach(k=>{ if (k.startsWith(sym+":")) delete all[k]; });
  savePlans(all);
}

/* ===== Geçmiş başarı (localStorage) ===== */
const HIST_KEY = "kgz_sig_hist_v1";
function loadHist(){ try{ return JSON.parse(localStorage.getItem(HIST_KEY)||"[]"); }catch{ return []; } }
function saveHist(arr){ try{ localStorage.setItem(HIST_KEY, JSON.stringify(arr.slice(-400))); }catch{} }
function histStatsFor(sym, days=7){
  const now = Date.now(), windowMs = days*24*60*60*1000;
  const arr = loadHist().filter(x => x.sym === sym && (now - x.ts) <= windowMs);

  const total = arr.length;
  const tp1 = arr.filter(x => x.resolved === "TP1").length;
  const tp2 = arr.filter(x => x.resolved === "TP2").length;
  const tp3 = arr.filter(x => x.resolved === "TP3").length;
  const tpAny = tp1 + tp2 + tp3;

  const sl  = arr.filter(x => x.resolved === "SL").length;
  const ts  = arr.filter(x => x.resolved === "TS").length;          // time-stop
  const open= arr.filter(x => !x.resolved).length;

  // Oran: TS’leri nötr say, yalnızca TP vs SL bazlı başarı
  const denom = tpAny + sl;
  const rate  = denom ? Math.round((tpAny/denom)*100) : 0;

  return { total, tp1, tp2, tp3, tpAny, sl, ts, open, rate };

}
function histSummary(days=7){
  const now = Date.now(), windowMs = days*24*60*60*1000;
  const arr = loadHist().filter(x => (now - x.ts) <= windowMs);

  const total = arr.length;
  const tp1 = arr.filter(x => x.resolved === "TP1").length;
  const tp2 = arr.filter(x => x.resolved === "TP2").length;
  const tp3 = arr.filter(x => x.resolved === "TP3").length;
  const tpAny = tp1 + tp2 + tp3;

  const sl  = arr.filter(x => x.resolved === "SL").length;
  const ts  = arr.filter(x => x.resolved === "TS").length;
  const open= arr.filter(x => !x.resolved).length;

  const denom = tpAny + sl;
  const rate  = denom ? Math.round((tpAny/denom)*100) : 0;

  return { total, tp1, tp2, tp3, tpAny, sl, ts, open, rate };
}


/* ===== Öğrenen AI (yerel istatistik) ===== */
const LEARN_KEY = "kgz_sig_learn_v1";
function loadLearn(){ try{ return JSON.parse(localStorage.getItem(LEARN_KEY)||'{"feats":{},"sym":{},"meta":{"v":1}}'); }catch{ return {feats:{},sym:{},meta:{v:1}}; } }
function saveLearn(x){ try{ localStorage.setItem(LEARN_KEY, JSON.stringify(x)); }catch{} }
function betaRate(a,b){ return (a+1)/(a+b+2); } // Laplace
function featAdd(feats, key, success){
  const cur = feats[key] || {a:0,b:0};
  if (success) cur.a++; else cur.b++;
  feats[key]=cur;
}
function aiLearnUpdate(keys, sym, success){
  const L = loadLearn();
  keys.forEach(k=> featAdd(L.feats, k, success));
  featAdd(L.sym, sym, success);
  saveLearn(L);
}
function aiScoreBoost(keys, sym){
  const L = loadLearn();
  let boost = 0, used=0;
  const s = L.sym?.[sym];
  if (s){
    const r = betaRate(s.a,s.b); const delta = r-0.5;
    const b = clamp(delta*20, -6, 6); boost += b; used++;
  }
  for (const k of keys){
    const f = L.feats?.[k];
    if (!f) continue;
    const r = betaRate(f.a,f.b); const delta = r-0.5;
    const w = k.startsWith("div_")||k.startsWith("adx_") ? 18 : k.startsWith("regime_")? 12 : k.startsWith("whale_")||k.startsWith("fund_")||k.startsWith("oi_") ? 14 : 10;
    const b = clamp(delta*w, -8, 10);
    boost += b; used++;
  }
  return { boost: clamp(boost, -12, 16), used };
}

/* ===== Basit korelasyon ===== */
function toReturns(closes){
  const out=[]; for(let i=1;i<closes.length;i++){
    const p=Number(closes[i-1]), c=Number(closes[i]);
    if (isNaN(p)||isNaN(c)||p===0) continue;
    out.push((c/p)-1);
  }
  return out;
}
function pearsonCorr(a,b){
  const n=Math.min(a.length,b.length);
  if (n<10) return null;
  const x=a.slice(-n), y=b.slice(-n);
  const mx = x.reduce((s,v)=>s+v,0)/n;
  const my = y.reduce((s,v)=>s+v,0)/n;
  let num=0, dx=0, dy=0;
  for(let i=0;i<n;i++){
    const vx=x[i]-mx, vy=y[i]-my;
    num += vx*vy; dx += vx*vx; dy += vy*vy;
  }
  const den = Math.sqrt(dx*dy);
  if (!den) return null;
  return num/den;
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
// BTC Dominance – opsiyonel; endpoint yoksa sessizce devre dışı
async function getBTCDominance(){
  try{
    // Örn cevap: { value: 53.2, chgPct: 0.8 }  (chgPct: 24s değişim)
    const r = await fetch(`/api/global/btcd`, { cache:"no-store" });
    const j = await r.json();
    const value = Number(j?.value);
    const chgPct = Number(j?.chgPct);
    if (!isNaN(value) && !isNaN(chgPct)) return { value, chgPct };
  }catch{}
  return { value:null, chgPct:null };
  // === Risk yardımcıları ===
function makeCtxFromRow(row){
  const ctx = {
    sym: row.sym || row.symbol || row.ticker,
    tf: row.tf || row.timeframe || "5m",
    dir: row.dir || row.direction,
    price: row.price ?? row.last ?? row.close,
    ema20: row.ema20, ema50: row.ema50, ema200: row.ema200,
    bbUpper: row.bbUpper, bbLower: row.bbLower,
    atr14: row.atr14, rsi14: row.rsi14, rsiSlope3: row.rsiSlope3,
    hourTR: (new Date()).getHours()
  };
  return ctx;
}

function isCooling(sym, dir){
  const key = `${sym}-${dir}`;
  const u = cooldownUntil[key] || 0;
  return Date.now() < u;
}
function armCooldown(sym, dir, mins){
  const key = `${sym}-${dir}`;
  setCooldownUntil(prev => ({...prev, [key]: Date.now() + mins*60*1000}));
}

function guardedSignal(row){
  const ctx = makeCtxFromRow(row);
  if(!ctx || !Number.isFinite(ctx.price) || !Number.isFinite(ctx.atr14)) return { blocked:"no-data" };
  if(!ctx.dir) return { blocked:"no-dir" };
  if(isCooling(ctx.sym, ctx.dir)) return { blocked:"cooldown" };
  if(!entryAllowed(ctx)) return { blocked:"filters" };

  const setup = stopsAndTargets({ dir: ctx.dir, entry: ctx.price, atr14: ctx.atr14, tf: ctx.tf });
  return { ctx, setup, blocked:null };
}

function RiskBadge({blocked}) {
  if(!blocked) return null;
  const txt = blocked==="cooldown" ? "Cooldown aktif"
            : blocked==="filters"  ? "Sıkışık / Trend dışı"
            : blocked==="no-data"  ? "Veri eksik"
            : blocked==="no-dir"   ? "Yön yok"
            : blocked;
  return (
    <span style={{padding:"2px 6px", border:"1px solid #555", borderRadius:6, fontSize:12}}>
      {txt}
    </span>
  );
}

function SLTPPreview({setup}) {
  if(!setup) return null;
  const { sl,tp1,tp2,tp3 } = setup;
  const f = (v)=> (Number.isFinite(v) ? v.toFixed(4) : "—");
  return (
    <div style={{fontSize:12, opacity:0.9}}>
      SL: {f(sl)} · TP1: {f(tp1)} · TP2: {f(tp2)} · TP3: {f(tp3)}
    </div>
  );
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

  /* Semboller */
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

  /* Kontroller */
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
  const [minPot,setMinPot] = useState(0.10);
  const [sameDir,setSameDir] = useState(false);
  const [useRegime,setUseRegime] = useState(false);
  const [useSqueeze,setUseSqueeze] = useState(false);
  const [sqThresh,setSqThresh] = useState(0.012);

  const [useWhale,setUseWhale] = useState(true);
  const [useOI,setUseOI] = useState(true);
  const [useFunding,setUseFunding] = useState(true);
  const [riskCfg] = useState({
  cooldownMin: 20,   // SL sonrası bekleme (dk)
  showBadges: true   // Chop/Cooldown rozetlerini göster
});

const [cooldownUntil, setCooldownUntil] = useState({}); // { "BTCUSDT-long": ts, ... }

  // BTC Dominance (opsiyonel)
  const [useBTCDom, setUseBTCDom] = useState(false);
  const [btcdThresh, setBtcdThresh] = useState(0.5); // % değişim eşiği (örn 0.5 = %0.5)
  const [btcd, setBtcd] = useState({ value:null, chgPct:null });

  const [capital,setCapital] = useState(100);
  const [riskPct,setRiskPct] = useState(0.5);
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
  const [stats,setStats] = useState({scanned:0, kept:0});
  const [loading,setLoading] = useState(false);
  const [rows,setRows] = useState([]);

  /* === Yeni: Öğrenen AI ayarları === */
  const [aiEnabled,setAiEnabled] = useState(true);
  const [aiPanel,setAiPanel] = useState(false);
  const [minQuote24h,setMinQuote24h] = useState(100_000_000);
  const [adxMin,setAdxMin] = useState(0);
  const [excludeHyperVol,setExcludeHyperVol] = useState(false);
  const [hyperVolPct,setHyperVolPct] = useState(0.05);
  const [maxRows,setMaxRows] = useState(5);

  /* Arama + Süzgeç */
  const [q,setQ] = useState("");
  const [filterSym,setFilterSym] = useState("");
  const normSym = (t)=>{
    if(!t) return "";
    const u=t.trim().toUpperCase();
    return u.endsWith("USDT")? u : (u+"USDT");
  };

  /* === RR filtresi + BTC korelasyon/teyit === */
  const [rrMin, setRrMin] = useState(1.5);
  const [corrMin, setCorrMin] = useState(0.6);
  const [gateByBTC, setGateByBTC] = useState(true);
  /* TARAMA */
  async function scanOnce(params){
    const {
      minPotX, sameDirX, useRegimeX, useSqueezeX, sqThreshX,
      minQuote24hX, adxMinX, excludeHyperVolX, hyperVolPctX,
      rrMinX, corrMinX, gateByBTCX,
      btc15Series, btcBias
    } = params;

    // BTC dominance çek (opsiyonel)
    const btcdNow = await getBTCDominance();
    if (btcdNow.value!=null) setBtcd(btcdNow);

    const btcCloses = (btc15Series||[]).map(b=> Number(b.close ?? b.c)).filter(v=>!isNaN(v));
    const btcRets = toReturns(btcCloses);

    const listAll = symbols;
    const list = listAll.filter(s=>!onlyFavs || favSet.has(s));
    const out = [];

    for (const sym of list){
      const reqs = [
        getLatest(sym, potIv),
        ...activeIntervals.map(iv=>getLatest(sym,iv)),
        getLatest(sym,"15m"),
        (useWhale||useOI||useFunding) ? getMetrics(sym) : Promise.resolve({oiChangePct:0,fundingRate:0,whaleNetflowUsd:0}),
        getSeries(sym,"15m",220)
      ];
      const res = await Promise.all(reqs);
      const Lpot = res[0];
      const frames = {}; activeIntervals.forEach((iv,i)=>frames[iv]=res[i+1]);
      const atrRef = res[1+activeIntervals.length];
      const metrics = res[2+activeIntervals.length] || {oiChangePct:0,fundingRate:0,whaleNetflowUsd:0};
      const s15 = res[3+activeIntervals.length] || [];

      // Hacim filtresi
      const qv = quoteVol24h(s15);
      if (minQuote24hX && qv!=null && qv < minQuote24hX) continue;

      // Yön + base skor
      let w=0, s=0;
      const weight = {"3m":0.6,"5m":0.5,"15m":0.7,"30m":0.6,"1h":0.8,"4h":0.5};
      const perTF = {};
      for(const [iv,L] of Object.entries(frames)){
        if(!L) continue;
        const bs=biasScore(L); s+=bs.raw*(weight[iv]||0.5); w+=(weight[iv]||0.5);
        perTF[iv]=bs;
      }
      const raw = w? s/w : 0;
      const dir = raw>0.06?"LONG": raw<-0.06?"SHORT":"NEUTRAL";
      if (dir==="NEUTRAL") continue;

      // === BTC Dominance filtresi (yalnızca altcoinler için) ===
      if (useBTCDom && btcdNow.value!=null && btcdNow.chgPct!=null && sym!=="BTCUSDT"){
        // BTC.D ↑ (chgPct > +eşik) → altcoin LONG elenir
        if (dir==="LONG" && btcdNow.chgPct > btcdThresh) continue;
        // BTC.D ↓ (chgPct < -eşik) → altcoin SHORT elenir
        if (dir==="SHORT"&& btcdNow.chgPct < -btcdThresh) continue;
      }

      // MTF / Rejim / Sıkışma
      if (sameDirX){
        const signs = activeIntervals.map(iv=>{
          const bs = frames[iv] ? biasScore(frames[iv]) : null;
          return bs ? (bs.raw>0?1:bs.raw<0?-1:0) : 0;
        }).filter(x=>x!==0);
        if (signs.length && !signs.every(x=>x===signs[0])) continue;
      }
      if (useRegimeX){
        const L15=frames["15m"], L1h=frames["1h"];
        if (dir==="LONG"){
          if (L15 && !(L15.close>L15.ema20)) continue;
          if (L1h && !(L1h.close>L1h.ema20)) continue;
        }else{
          if (L15 && !(L15.close<L15.ema20)) continue;
          if (L1h && !(L1h.close<L1h.ema20)) continue;
        }
      }
      if (useSqueezeX){
        const L = frames["15m"] || frames["30m"] || frames["5m"];
        const c=L?.close, bu=L?.bbUpper, bl=L?.bbLower;
        const bw = (c&&bu!=null&&bl!=null) ? (bu-bl)/c : null;
        if (bw==null || !(bw <= sqThreshX)) continue;
      }

      // Potansiyel (BB/ATR)
      const c0 = Lpot?.close ?? frames["15m"]?.close ?? frames["1h"]?.close;
      let potPct = null; let potSource="BB";
      const upBB   = (Lpot?.bbUpper!=null && c0) ? (Lpot.bbUpper - c0)/c0 : null;
      const downBB = (Lpot?.bbLower!=null && c0) ? (c0 - Lpot.bbLower)/c0 : null;
      let atr = atrRef?.atr14 || null;
      if (!atr){
        const calc = computeATR14FromSeries(s15);
        if (calc) atr = calc;
      }
      if (dir==="LONG"){
        if (upBB!=null) potPct = upBB*100;
        else if (atr && c0){ potPct = (atr*2)/c0*100; potSource="ATR"; }
      }else{
        if (downBB!=null) potPct = downBB*100;
        else if (atr && c0){ potPct = (atr*2)/c0*100; potSource="ATR"; }
      }
      if (potPct==null || potPct < minPotX*100) continue;

      // Volatilite filtresi
      if (excludeHyperVolX){
        const atrNow = atr ?? computeATR14FromSeries(s15) ?? null;
        const cc = c0 ?? frames["15m"]?.close ?? null;
        const volP = (atrNow && cc)? (atrNow/cc) : null;
        if (volP!=null && volP > hyperVolPctX) continue;
      }

      // ADX & RSI Divergence
      const adx = computeADX14(s15);
      if (adxMinX && adx!=null && adx < adxMinX) continue;
      const div = detectRSIDivergence(s15); // "bullish"/"bearish"/null

      // Konfluens & skor
      const notes=[]; let confl=0;
      if (adx!=null){
        if (adx>=30) {confl+=2; notes.push("ADX güçlü");}
        else if (adx>=25){confl+=1; notes.push("ADX orta");}
      }
      if (div==="bullish" && dir==="LONG"){confl+=2; notes.push("RSI bullish div");}
      if (div==="bearish"&& dir==="SHORT"){confl+=2; notes.push("RSI bearish div");}
      if (metrics.whaleNetflowUsd){
        if (dir==="LONG" && metrics.whaleNetflowUsd>0){ confl+=2; notes.push("Whale↑"); }
        if (dir==="SHORT"&& metrics.whaleNetflowUsd<0){ confl+=2; notes.push("Whale↓"); }
      }
      if (metrics.oiChangePct>0){ confl+=1; notes.push(`OI ${fmt(metrics.oiChangePct,1)}%`); }
      if (metrics.fundingRate){
        const f=metrics.fundingRate;
        if (dir==="LONG" && f<0){ confl+=1; notes.push(`Funding ${fmt(f*100,3)}%`); }
        if (dir==="SHORT"&& f>0){ confl+=1; notes.push(`Funding ${fmt(f*100,3)}%`); }
      }

      let baseScore = Math.round((clamp(raw,-1,1)+1)*50);
      let score = Math.min(100, Math.max(0, Math.round(baseScore + (potPct>=30?5:0) + confl*2)));

      // === AI boost
      const aiFeat = [];
      aiFeat.push(`dir_${dir}`);
      for (const [iv,bs] of Object.entries(perTF)){ if (bs) aiFeat.push(`tf_${iv}_${bs.dir}`); }
      if (useRegimeX) aiFeat.push(`regime_${dir}`);
      if (useSqueezeX && sqThreshX) aiFeat.push(`sq_${sqThreshX}`);
      if (potSource) aiFeat.push(`pot_${potSource}`);
      if (adx!=null){
        if (adx>=30) aiFeat.push("adx_30");
        else if (adx>=25) aiFeat.push("adx_25");
      }
      if (div) aiFeat.push(`div_${div}`);

      let aiBoost=0;
      if (aiEnabled){
        const ab = aiScoreBoost(aiFeat, sym);
        aiBoost = ab.boost;
        score = Math.min(100, Math.max(0, score + aiBoost));
      }

      // Plan (kilitli)
      const Lref = frames["15m"] || frames["30m"] || frames["1h"] || Lpot;
      let plan = getLockedPlan(sym, dir);
      let atrCalc = atr ?? computeATR14FromSeries(s15) ?? null;
      if (!plan){
        const tmp = calcPlan(dir, Lref, DEFAULT_ATR_K, atrCalc);
        if (tmp) plan = lockPlan(sym, dir, tmp);
      }

      // S/R + Trend
      const ana = analyzeSRandTrend(s15, frames["15m"]?.ema20 ?? null);
      const sr=ana.sr; const trend=ana.trend;

      // Risk etiketi
      const risk = riskLabel(Lref);

      // Fiyat
      const live = wsTicks[sym]?.last ?? null;
      const price = live ?? Lref?.close ?? c0 ?? null;

      // === RR filtresi
      const rr = rrFromSRorPot(dir, price, plan?.r, sr, potPct);
      if (rrMinX>0 && rr!=null && rr < rrMinX) continue;

      // === BTC korelasyon + yön teyidi
      let corrBTC=null;
      if (btcRets.length && s15.length){
        const coinCloses = s15.map(b=> Number(b.close ?? b.c)).filter(v=>!isNaN(v));
        const coinRets = toReturns(coinCloses);
        corrBTC = pearsonCorr(coinRets, btcRets);
      }
      if (gateByBTCX && corrMinX>0 && corrBTC!=null && Math.abs(corrBTC)>=corrMinX){
        if ((btcBias?.raw>0.06 && dir==="SHORT") || (btcBias?.raw<-0.06 && dir==="LONG")) continue;
      }

      // AI yorum
      const aiBits=[];
      if (trend!=="—") aiBits.push(trend);
      if (sr?.distSup!=null) aiBits.push(`Destek ${fmt(sr.distSup,2)}%`);
      if (sr?.distRes!=null) aiBits.push(`Direnç ${fmt(sr.distRes,2)}%`);
      const aiComment = aiBits.join(" • ");

      // Pozisyon boyutu – ✅ DOĞRU ÇAĞRI
      let posScale = 1.0;
      if (aiEnabled){
        const Lrn = loadLearn();
        const s = Lrn.sym?.[sym];
        const symEdge = s ? (betaRate(s.a,s.b)-0.5) : 0;
        posScale *= clamp(1 + symEdge*0.6, 0.7, 1.2);
      }
      if (atrCalc && price && (atrCalc/price) > 0.06) posScale *= 0.8;
      const riskUsd = capital*(riskPct/100)*posScale; // bilgi
      // çağrı tarafında capital kullanılacak

      out.push({
        sym, dir, score, aiBoost,
        potPct:Math.round(potPct), potSource, price,
        reasons: notes.join(" • "),
        entry: plan?.entry, sl: plan?.sl, tp1: plan?.tp1, tp2: plan?.tp2, tp3: plan?.tp3, r: plan?.r,
        risk, sr, trend, adx, div, qv, aiComment, fav: favSet.has(sym),
        rr: rr!=null ? rr : null,
        corrBTC: corrBTC!=null ? corrBTC : null
      });
    }

    out.sort((a,b)=> (Number(b.fav)-Number(a.fav)) || (b.score-a.score) || (b.potPct-a.potPct));
    return out;
  }

  async function doScan(){
    if(!symbols.length) return;
    setLoading(true); setEasyApplied(false);
    try{
      const [btc15Series, btcL15] = await Promise.all([
        getSeries("BTCUSDT","15m",220),
        getLatest("BTCUSDT","15m")
      ]);
      const btcBias = biasScore(btcL15);

      let res = await scanOnce({
        minPotX:minPot, sameDirX:sameDir, useRegimeX:useRegime, useSqueezeX:useSqueeze, sqThreshX:sqThresh,
        minQuote24hX:minQuote24h, adxMinX:adxMin, excludeHyperVolX:excludeHyperVol, hyperVolPctX:hyperVolPct,
        rrMinX:rrMin, corrMinX:corrMin, gateByBTCX:gateByBTC,
        btc15Series, btcBias
      });
      if (res.length===0 && easyMode){
        res = await scanOnce({
          minPotX:Math.min(minPot,0.10), sameDirX:false, useRegimeX:false, useSqueezeX:false, sqThreshX:sqThresh,
          minQuote24hX:0, adxMinX:0, excludeHyperVolX:false, hyperVolPctX:hyperVolPct,
          rrMinX:0, corrMinX:0, gateByBTCX:false,
          btc15Series, btcBias
        });
        setEasyApplied(true);
      }
      if (filterSym) res = res.filter(r=>r.sym===filterSym);
      if (maxRows>0) res = res.slice(0, maxRows);

      setRows(res);
      setStats({scanned: symbols.length, kept: res.length});
      setLastRunAt(new Date());
    } finally {
      setLoading(false);
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
    easyMode,useWhale,useOI,useFunding,capital,riskPct,onlyFavs,filterSym,
    minQuote24h, adxMin, excludeHyperVol, hyperVolPct, maxRows, aiEnabled,
    rrMin, corrMin, gateByBTC, useBTCDom, btcdThresh
  ]);
/* WS: TP/SL izleme + trailing + başarı + ÖĞRENME güncellemesi */
const watchers = useRef({});

useEffect(() => {
  // Var olan WS’leri kapat
  Object.values(watchers.current).forEach(w => { try { w.sock && w.sock.close(); } catch {} });
  watchers.current = {};

  rows.forEach(r => {
    if (!r?.sym || !r?.entry || !r?.sl || !r?.tp1) return;

    const url  = `wss://fstream.binance.com/ws/${r.sym.toLowerCase()}@miniTicker`;
    const sock = new WebSocket(url);

    // Her coin için durum objesi
    const state = {
      sock,
      resolved: false,
      tp1Hit: false,
      tp2Hit: false,
      // TS (time-stop) sayacı
      tsTimer: null,
      tsAt: Date.now() + (timeStopMin * 60 * 1000)
    };
    watchers.current[r.sym] = state;

    // TS sayacı: süre dolarsa “TS” ile kapat
    state.tsTimer = setInterval(() => {
      if (state.resolved) return;
      if (Date.now() >= state.tsAt) {
        state.resolved = true;
        finalize("TS");
      }
    }, 5000);

    sock.onmessage = (ev) => {
      if (state.resolved) return;
      try {
        const d = JSON.parse(ev.data);
        const c = d?.c ? +d.c : null;
        if (!c) return;

        if (r.dir === "LONG") {
          // TP’ler → trailing
          if (!state.tp1Hit && c >= r.tp1) {
            state.tp1Hit = true;
            updateLockedPlan(r.sym, r.dir, { sl: r.entry });
            markFloating(r.sym, "TP1", r);
          }
          if (!state.tp2Hit && c >= r.tp2) {
            state.tp2Hit = true;
            updateLockedPlan(r.sym, r.dir, { sl: r.tp1 });
            markFloating(r.sym, "TP2", r);
          }
          // SL/TP3
          const curSL = getLockedPlan(r.sym, r.dir)?.sl ?? r.sl;
          if (c <= curSL) { state.resolved = true; finalize("SL"); }
          else if (c >= r.tp3) { state.resolved = true; finalize("TP3"); }
        } else {
          // SHORT
          if (!state.tp1Hit && c <= r.tp1) {
            state.tp1Hit = true;
            updateLockedPlan(r.sym, r.dir, { sl: r.entry });
            markFloating(r.sym, "TP1", r);
          }
          if (!state.tp2Hit && c <= r.tp2) {
            state.tp2Hit = true;
            updateLockedPlan(r.sym, r.dir, { sl: r.tp1 });
            markFloating(r.sym, "TP2", r);
          }
          const curSL = getLockedPlan(r.sym, r.dir)?.sl ?? r.sl;
          if (c >= curSL) { state.resolved = true; finalize("SL"); }
          else if (c <= r.tp3) { state.resolved = true; finalize("TP3"); }
        }
      } catch {}
    };

    // === Sonlandırma ve istatistik ===
    function finalize(tag) {
      // “stop” mantığı: hiç TP yoksa ve SL de yoksa TS sayılır; TS başarıya dahil edilmez
      if (tag === "TS") {
        markResolved(r.sym, "TS", r);   // ne TP ne SL
      } else if (tag === "SL") {
        // Eğer hiç TP vurmadıysa SL olarak say; TP vurduysa (ör. TP1 oldu sonra SL) yine SL olarak sayıyoruz
        markResolved(r.sym, "SL", r);
      } else {
        // TP1/TP2/TP3
        markResolved(r.sym, tag, r);
      }

      // Öğrenme güncelle
      const success = tag !== "SL" && tag !== "TS"; // SL ve TS başarısız sayılmaz
      const featKeys = [];
      featKeys.push(`dir_${r.dir}`);
      if (r.potSource) featKeys.push(`pot_${r.potSource}`);
      aiLearnUpdate(featKeys, r.sym, success);

      clearPlan(r.sym);

      try { state.sock && state.sock.close(); } catch {}
      if (state.tsTimer) { try { clearInterval(state.tsTimer); } catch {} }
    }

    function markFloating(sym, level, row) {
      const hist = loadHist();
      const idx = hist.findIndex(h => !h.resolved && h.sym === sym && Math.abs(Date.now() - h.ts) < 12 * 60 * 60 * 1000);
      if (idx < 0) hist.push({ sym, ts: Date.now(), dir: row.dir, entry: row.entry, sl: row.sl, tp1: row.tp1, tp2: row.tp2, tp3: row.tp3, resolved: null, float: level });
      else hist[idx].float = level;
      saveHist(hist);
    }

    function markResolved(sym, tag, row) {
      const hist = loadHist();
      const idx = hist.findIndex(h => !h.resolved && h.sym === sym && Math.abs(Date.now() - h.ts) < 12 * 60 * 60 * 1000);
      if (idx < 0) hist.push({ sym, ts: Date.now(), dir: row.dir, entry: row.entry, sl: row.sl, tp1: row.tp1, tp2: row.tp2, tp3: row.tp3, resolved: tag });
      else hist[idx].resolved = tag;
      saveHist(hist);
    }
  });

  // Cleanup: bütün açık WS ve TS’leri kapat
  return () => {
    Object.values(watchers.current).forEach(w => {
      try { w.sock && w.sock.close(); } catch {}
      try { w.tsTimer && clearInterval(w.tsTimer); } catch {}
    });
    watchers.current = {};
  };
}, [rows, timeStopMin]);


  if (!authOk) return <main style={{padding:16}}><div style={{opacity:.7}}>Yetki doğrulanıyor…</div></main>;
  if (!symbols.length) return <main style={{padding:16}}><div style={{opacity:.7}}>Semboller yükleniyor…</div></main>;

  /* HELP (TS & Dominance eklendi) */
  const HELP_TEXT = (
    <div style={{lineHeight:1.55}}>
      <b>Skor:</b> EMA/RSI/Stoch+BB birleşik. Konfluens (ADX, divergence, whale/OI/funding) eklenir. 80–100 güçlü.<br/>
      <b>AI Öğrenim:</b> Özellik & sembol bazlı sonuçları kaydeder; skora dinamik <b>AI Boost</b> ekler.<br/>
      <b>Potansiyel:</b> BB hedefi veya ATR×2. Min %10–30 arası seçilebilir.<br/>
      <b>RR (Risk/Ödül):</b> S/R ya da potansiyelden “ödül” hesaplanır. <b>RR ≥ eşik</b> değilse sinyal gizlenir.<br/>
      <b>CorrBTC:</b> Coin 15m getirisi ile BTC 15m getirisi arasındaki korelasyon. Eşik üstü ve BTC yönü ters ise elenir (BTC teyidi).<br/>
      <b>Dominance (opsiyonel):</b> BTC.D↑ iken altcoin <b>LONG</b>, BTC.D↓ iken altcoin <b>SHORT</b> sinyalleri elenir. Endpoint yoksa devre dışı.<br/>
      <b>Time-Stop (TS):</b> Plan kilitlendiği andan <b>{timeStopMin}dk</b> sonra hâlâ çözülmediyse otomatik <b>“TS”</b> ile kapanır (istatistikte SL gibi sayılır).<br/>
      <b>Plan (KİLİTLİ):</b> Entry/SL/TP1-3 sabit. Trailing: TP1→SL=Entry, TP2→SL=TP1.<br/>
      <b>Önerilen Poz.:</b> (Sermaye×Risk%) / R, AI adaptasyonu ile ölçeklenir.<br/>
      <b>Başarı %:</b> TP/SL/TS dokunuşları WS ile izlenir, 7g özet üstte.
    </div>
  );
  /* Grid + stiller */
  const gridCols = "1.05fr 0.65fr 0.9fr 0.9fr 1.15fr 1.6fr 2.25fr 1.35fr 1.2fr";
  const cellBorder = (i, total)=> ({ paddingRight:12, borderRight: i<total-1 ? "1px solid #1f2742" : "none" });
  const dash = histSummary(7);

  return (
    <main style={{minHeight:"100vh", background:"#0f1320", color:"#e6f0ff", padding:"16px 18px", paddingBottom:76}}>
      {/* NAV + kontrol */}
      <nav style={{display:"flex",gap:12,alignItems:"center",marginBottom:12,flexWrap:"wrap"}}>
        <button onClick={()=> (history.length>1 ? history.back() : router.push("/"))}
                style={btnSm} type="button">← Geri</button>
        <Link href="/" style={{color:"#8bd4ff",fontWeight:900,fontSize:18,textDecoration:"none"}}>Kripto Gözü</Link>
        <Link href="/" style={navL}>Ana Sayfa</Link>
        <Link href="/panel" style={navL}>Panel</Link>
        <Link href="/whales" style={navL}>Balina</Link>
        <Link href="/balina2d" style={navL}>Balina2D</Link>

        <span style={{marginLeft:"auto", display:"flex", gap:8, alignItems:"center", flexWrap:"wrap"}}>
          {/* Arama */}
          <input
            value={q}
            onChange={(e)=>setQ(e.target.value)}
            placeholder="BTC, ETH, SOL…"
            style={{ padding:"8px 10px", background:"#121625", border:"1px solid #23283b", borderRadius:10, color:"#fff", minWidth:160 }}
          />
          <button onClick={()=>{ const s=normSym(q); if(s) router.push(`/coin/${s}`); }} style={btnSm} type="button">Ara</button>
          <button onClick={()=>{ const s=normSym(q); setFilterSym(s); }} style={btnSm} type="button">Süz</button>
          {filterSym && <button onClick={()=>setFilterSym("")} style={btnSm} type="button">Temizle ({filterSym})</button>}

          <label style={lbl}><input type="checkbox" checked={easyMode} onChange={e=>setEasyMode(e.target.checked)}/> Kolay Mod</label>
          <label style={lbl}><input type="checkbox" checked={aiEnabled} onChange={e=>setAiEnabled(e.target.checked)}/> AI Öğrenim</label>
          <button onClick={()=>setAiPanel(v=>!v)} style={{...btnSm,padding:"6px 10px"}} type="button">AI ?</button>
          <button onClick={()=>setHelpOpen(v=>!v)} style={{...btnSm,padding:"6px 10px"}} type="button">?</button>

          <label style={lbl}>
            RR min
            <select value={String(rrMin)} onChange={e=>setRrMin(Number(e.target.value))} style={sel}>
              <option value="0">Kapalı</option>
              <option value="1.2">≥ 1.2</option>
              <option value="1.5">≥ 1.5</option>
              <option value="2.0">≥ 2.0</option>
            </select>
          </label>
          <label style={lbl}>
            CorrBTC
            <select value={String(corrMin)} onChange={e=>setCorrMin(Number(e.target.value))} style={sel}>
              <option value="0">Kapalı</option>
              <option value="0.6">≥ 0.6</option>
              <option value="0.7">≥ 0.7</option>
              <option value="0.8">≥ 0.8</option>
            </select>
          </label>
          <label style={lbl}><input type="checkbox" checked={gateByBTC} onChange={e=>setGateByBTC(e.target.checked)}/> BTC yön teyidi</label>

          {/* ✅ Dominance kontrolü */}
          <label style={lbl}><input type="checkbox" checked={useBTCDom} onChange={e=>setUseBTCDom(e.target.checked)}/> Dominance</label>
          <label style={lbl}>ΔBTC.D
            <select value={String(btcdThresh)} onChange={e=>setBtcdThresh(Number(e.target.value))} style={sel}>
              <option value="0.3">%0.3</option>
              <option value="0.5">%0.5</option>
              <option value="0.8">%0.8</option>
              <option value="1.0">%1.0</option>
            </select>
          </label>

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

      {/* Üst mini dashboard */}
      <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:10,opacity:.88}}>
        <span style={chip}>7g Sinyal: <b>{dash.total}</b></span>
<span style={chip}>
  Başarı: <b>{dash.rate}%</b> (TP:{dash.tpHits} / SL:{dash.sl ?? dash.slHits ?? 0}{dash.ts != null && ` / TS:${dash.ts}`})
</span>
        <span style={chip}>Tarandı: <b>{symbols.length}</b> • Gösterilen: <b>{rows.length}</b> • Son: {lastRunAt? lastRunAt.toLocaleTimeString():"—"}</span>
        {btcd.value!=null && (
          <span style={{...chip, border:"1px solid #314466", background:"#142235", color:"#9bd0ff"}}>
            BTC.D <b>{fmt(btcd.value,1)}%</b> ({btcd.chgPct>0?"+":""}{fmt(btcd.chgPct,2)}%)
          </span>
        )}
        {easyApplied && <span style={{...chip, border:"1px solid #314466", background:"#142235", color:"#9bd0ff", fontWeight:800}}>Kolay Mod devrede</span>}
        <button onClick={()=>{ aiReset(); alert("AI öğrenim istatistikleri sıfırlandı."); }} style={{...btnSm,marginLeft:8}}>AI Sıfırla</button>
      </div>

      {/* Filtre çubuğu */}
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

          <label style={lbl}>Min 24s Hacim
            <select value={String(minQuote24h)} onChange={e=>setMinQuote24h(Number(e.target.value))} style={sel}>
              <option value="25000000">≥ 25M</option>
              <option value="50000000">≥ 50M</option>
              <option value="100000000">≥ 100M</option>
              <option value="200000000">≥ 200M</option>
              <option value="0">Kapalı</option>
            </select>
          </label>

          <label style={lbl}>Min ADX
            <select value={String(adxMin)} onChange={e=>setAdxMin(Number(e.target.value))} style={sel}>
              <option value="0">Kapalı</option>
              <option value="20">20</option>
              <option value="25">25</option>
              <option value="30">30</option>
            </select>
          </label>

          <label style={lbl}><input type="checkbox" checked={excludeHyperVol} onChange={e=>setExcludeHyperVol(e.target.checked)}/> Aşırı oynak hariç</label>
          <label style={lbl}>Eşik
            <select value={String(hyperVolPct)} onChange={e=>setHyperVolPct(Number(e.target.value))} style={sel}>
              <option value="0.03">%3</option>
              <option value="0.05">%5</option>
              <option value="0.08">%8</option>
            </select>
          </label>

          <label style={lbl}>Max Sinyal
            <select value={String(maxRows)} onChange={e=>setMaxRows(Number(e.target.value))} style={sel}>
              <option value="3">3</option>
              <option value="5">5</option>
              <option value="8">8</option>
              <option value="0">Sınırsız</option>
            </select>
          </label>

          <label style={lbl}><input type="checkbox" checked={onlyFavs} onChange={e=>setOnlyFavs(e.target.checked)}/> Sadece Favoriler</label>
          <label style={lbl}>Sermaye<input type="number" value={capital} onChange={e=>setCapital(Number(e.target.value||0))} style={{...sel,width:90}}/></label>
          <label style={lbl}>Risk %<input type="number" step="0.1" value={riskPct} onChange={e=>setRiskPct(Number(e.target.value||0))} style={{...sel,width:80}}/></label>

          <button onClick={doScan} disabled={loading} style={btnPrimary}>{loading?"Taranıyor…":"Yenile"}</button>
        </div>
      </div>

      {/* Başlık */}
      <div style={{
        display:"grid",
        gridTemplateColumns:gridCols,
        padding:"10px 12px", background:"#0e1424",
        border:"1px solid #1f2742", borderRadius:"12px 12px 0 0",
        color:"#a9b4c9", fontWeight:800
      }}>
        <div style={cellBorder(0,9)}>Coin</div>
        <div style={cellBorder(1,9)}>Yön</div>
        <div style={cellBorder(2,9)}>Skor <span title="AI Boost dahil">ⓘ</span></div>
        <div style={cellBorder(3,9)}>Başarı % (7g)</div>
        <div style={cellBorder(4,9)}>S/R (yakın)</div>
        <div style={cellBorder(5,9)}>Trend / ADX / Div</div>
        <div style={cellBorder(6,9)}>Entry • SL • TP1/2/3</div>
        <div style={cellBorder(7,9)}>Önerilen Poz.</div>
        <div style={cellBorder(8,9)}>Kaynak</div>
      </div>

      {/* Liste */}
      <div style={{border:"1px solid #1f2742", borderTop:"none", borderRadius:"0 0 12px 12px", overflow:"hidden"}}>
        {rows.length===0 && (
          <div style={{padding:"14px 16px", opacity:.78}}>Şu an kriterlere uyan sinyal yok. Filtreleri gevşetip tekrar dene.</div>
        )}

        {rows.map((r,i)=>{
          const price = wsTicks[r.sym]?.last ?? r.price ?? r.entry ?? null;
          const chg   = wsTicks[r.sym]?.chg ?? null;
          const plan  = r.entry ? r : null;
          // ✅ Çağrı düzeltildi: capital üzerinden
          const pos   = plan ? positionSize(capital, riskPct, r.r) : 0;
          const fav   = r.fav;
          const hs    = histStatsFor(r.sym,7);
          return (
            <div key={r.sym} style={{
              display:"grid",
              gridTemplateColumns:gridCols,
              padding:"13px 12px",
              borderTop: i===0 ? "none" : "1px solid #1f2742",
              alignItems:"center",
              background: i%2 ? "#0f1329" : "#0e1226",
              lineHeight:1.35
            }}>
              {/* Coin */}
              <div style={{...cellBorder(0,9),display:"flex",alignItems:"center",gap:10,overflow:"hidden"}}>
                <button onClick={()=> setFavs(p=> fav ? p.filter(x=>x!==r.sym) : [...p,r.sym])}
                        title={fav?"Favoriden çıkar":"Favorilere ekle"}
                        style={{background:"transparent",border:"none",cursor:"pointer",fontSize:18,lineHeight:1}}>{fav?"★":"☆"}</button>
                <Link href={`/coin/${r.sym}`} style={{color:"#8bd4ff",fontWeight:900,textDecoration:"none",whiteSpace:"nowrap"}}>{r.sym}</Link>
                <span style={{opacity:.7,whiteSpace:"nowrap",fontSize:12}}>
                  @ {fmtPrice(price)} {chg!=null && <b style={{color: chg>=0?"#22d39a":"#ff6b6b"}}> {pctTxt(chg)}</b>}
                </span>
                {r.qv!=null && <span style={{opacity:.5,fontSize:11,marginLeft:8}}> • 24s Vol: ~{fmt(r.qv/1e6,1)}M</span>}
              </div>

              {/* Yön */}
              <div style={{...cellBorder(1,9),fontWeight:900,color:r.dir==="LONG"?"#22d39a":"#ff6b6b"}}>{r.dir}</div>

              {/* Skor (+AI) */}
              <div style={{...cellBorder(2,9),display:"flex",alignItems:"center",gap:8}}>
                <span>{fmt(r.score,0)}</span>
                {r.aiBoost!==undefined && (
                  <span title={"AI Boost: " + fmt(r.aiBoost,1)} style={{padding:"2px 6px",border:"1px solid #2a2f45",borderRadius:8,background:"#132036",color:"#9bd0ff",fontSize:12,fontWeight:800}}>
                    AI {r.aiBoost>=0?"+":""}{fmt(r.aiBoost,1)}
                  </span>
                )}
              </div>

              {/* Başarı % */}
              <div style={cellBorder(3,9)} title={`7g • TP:${hs.tpHits} / SL+TS:${hs.slHits} • Toplam:${hs.total}`}>{hs.rate? `${hs.rate}%` : "—"}</div>

              {/* S/R */}
              <div style={cellBorder(4,9)}>
                {r.sr
                  ? <span>
                      Destek {r.sr.sup? <b>{fmtPrice(r.sr.sup)}</b> : "—"} ({r.sr.distSup!=null? `${fmt(r.sr.distSup,2)}%`:"—"}) •
                      Direnç {r.sr.res? <b>{fmtPrice(r.sr.res)}</b> : "—"} ({r.sr.distRes!=null? `${fmt(r.sr.distRes,2)}%`:"—"})
                    </span>
                  : <span style={{opacity:.6}}>—</span>}
              </div>

              {/* Trend / ADX / Div + AI yorum */}
              <div style={cellBorder(5,9)}>
                {r.trend || "—"}
                {r.adx!=null && <span style={{opacity:.75}}> • ADX {fmt(r.adx,0)}</span>}
                {r.div && <span style={{opacity:.75}}> • {r.div==="bullish"?"RSI Bull Div":"RSI Bear Div"}</span>}
                {r.aiComment ? <span style={{opacity:.65}}> • {r.aiComment}</span> : null}
              </div>

              {/* Entry/SL/TP */}
              <div style={{...cellBorder(6,9),fontSize:13}}>
                {plan
                  ? (<span>
                      Entry <b>{fmtPrice(r.entry)}</b> • SL <b>{fmtPrice(getLockedPlan(r.sym, r.dir)?.sl ?? r.sl)}</b> •
                      TP1 <b>{fmtPrice(r.tp1)}</b> / TP2 <b>{fmtPrice(r.tp2)}</b> / TP3 <b>{fmtPrice(r.tp3)}</b>
                      <span style={{opacity:.6}}> • ATR×{fmt(DEFAULT_ATR_K,2)} • TS {timeStopMin}dk</span>
                    </span>)
                  : (<span style={{opacity:.6}}>Plan (ATR/BB) üretilemedi</span>)
                }
              </div>

              {/* Önerilen Poz. + Paper */}
              <div style={{...cellBorder(7,9),fontSize:13,display:"flex",alignItems:"center",gap:8}}>
                {plan
                  ? (pos>0
                      ? <span>Boyut: <b>{fmt(pos,3)}</b> adet • Risk: ~<b>{fmt(capital*(riskPct/100),2)} USDT</b> • <span style={{color:r.risk?.color}}>{r.risk?.txt||"—"}</span></span>
                      : <span style={{opacity:.6}}>Sermaye/Risk/ATR yetersiz</span>)
                  : <span style={{opacity:.6}}>Plan yok</span>
                }
                <button
                  style={{marginLeft:8,padding:"4px 8px",border:"1px solid #2a2f45",background:"#121625",borderRadius:8,color:"#dfe6f3",cursor:"pointer"}}
                  onClick={()=>{
                    const hist=loadHist();
                    hist.push({sym:r.sym,ts:Date.now(),dir:r.dir,entry:r.entry,sl:(getLockedPlan(r.sym, r.dir)?.sl ?? r.sl),tp1:r.tp1,tp2:r.tp2,tp3:r.tp3,resolved:null,manual:true});
                    saveHist(hist);
                    alert("Paper trade başlatıldı. TP/SL/TS dokunuşları izleniyor (tarayıcı).");
                  }}
                >Paper</button>
              </div>

              {/* Kaynak + RR + Corr */}
              <div style={{opacity:.9}}>
                {r.potSource==="BB"?"BB":"ATR"}, MTF
                {r.rr!=null && <> • RR≈{fmt(r.rr,2)}</>}
                {r.corrBTC!=null && <> • CorrBTC={fmt(r.corrBTC,2)}</>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Açıklama paneli */}
      {helpOpen && (
        <div style={helpBox}>{HELP_TEXT}</div>
      )}

      {/* AI ağırlıkları paneli */}
      {aiPanel && <AiWeightsPanel onClose={()=>setAiPanel(false)} />}

      <p style={{opacity:.6,marginTop:10,fontSize:12}}>
        Kaynak: Binance Futures (miniTicker WS + MTF indicators + {potIv.toUpperCase()} potansiyel + 15m S/R, ADX, RSI divergence, 24s hacim + <b>AI öğrenen skor</b>).
        Bilgi amaçlıdır, yatırım tavsiyesi değildir.
      </p>
    </main>
  );
}

/* ===== AI Ağırlık görüntüleme (opsiyonel) ===== */
function AiWeightsPanel({ onClose }){
  const L = loadLearn();
  const items = Object.entries(L.feats||{}).map(([k,v])=>({k, a:v.a||0, b:v.b||0, r: betaRate(v.a||0,v.b||0)}))
    .sort((x,y)=> ( (y.a+y.b)-(x.a+x.b) ));
  const symItems = Object.entries(L.sym||{}).map(([k,v])=>({k, a:v.a||0, b:v.b||0, r: betaRate(v.a||0,v.b||0)}))
    .sort((x,y)=> ( (y.a+y.b)-(x.a+x.b) ));

  return (
    <div style={{
      position:"fixed", left:0, right:0, bottom:0, top:0, background:"rgba(0,0,0,.55)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000
    }}>
      <div style={{width:"min(920px,96vw)", maxHeight:"80vh", overflow:"auto", background:"#0f1328", border:"1px solid #1f2742", borderRadius:12, padding:14}}>
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8}}>
          <b style={{fontSize:16}}>AI Öğrenim Ağırlıkları</b>
          <button onClick={onClose} style={btnSm}>Kapat</button>
        </div>

        <div style={{display:"grid", gridTemplateColumns:"1fr 120px 120px 120px", gap:8, fontWeight:800, color:"#9bb8e8", padding:"6px 0", borderBottom:"1px solid #22324f"}}>
          <div>Özellik</div><div>Başarı Oranı</div><div>TP</div><div>SL</div>
        </div>
        {items.map((it,i)=>(
          <div key={i} style={{display:"grid", gridTemplateColumns:"1fr 120px 120px 120px", gap:8, padding:"6px 0", borderBottom:"1px solid #1b2642"}}>
            <div style={{opacity:.95}}>{it.k}</div>
            <div><b>{fmt(it.r*100,1)}%</b></div>
            <div>{it.a}</div>
            <div>{it.b}</div>
          </div>
        ))}

        <div style={{height:10}} />
        <div style={{display:"grid", gridTemplateColumns:"1fr 120px 120px 120px", gap:8, fontWeight:800, color:"#9bb8e8", padding:"6px 0", borderBottom:"1px solid #22324f"}}>
          <div>Sembol</div><div>Başarı Oranı</div><div>TP</div><div>SL</div>
        </div>
        {symItems.map((it,i)=>(
          <div key={i} style={{display:"grid", gridTemplateColumns:"1fr 120px 120px 120px", gap:8, padding:"6px 0", borderBottom:"1px solid #1b2642"}}>
            <div style={{opacity:.95}}>{it.k}</div>
            <div><b>{fmt(it.r*100,1)}%</b></div>
            <div>{it.a}</div>
            <div>{it.b}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===== Styles ===== */
const navL = { color:"#d0d6e6", textDecoration:"none" };
const lbl  = { display:"inline-flex", alignItems:"center", gap:8, padding:"6px 10px", border:"1px solid #2a2f45", background:"#121625", borderRadius:8 };
const sel  = { padding:"6px 8px", background:"#0f1320", border:"1px solid #23283b", borderRadius:8, color:"#e6e6e6" };
const btnSm= { padding:"6px 10px", background:"#1a1f2e", border:"1px solid #2a2f45", borderRadius:8, color:"#fff", cursor:"pointer" };
const btnPrimary = { padding:"8px 12px", background:"#1a1f2e", border:"1px solid #2a2f45", borderRadius:10, color:"#fff", fontWeight:800, cursor:"pointer" };
const chip = { padding:"6px 10px", border:"1px solid #2a2f45", borderRadius:8, background:"#101a30" };
const helpBox = { marginTop:10, border:"1px solid #22324f", background:"#0f152a", borderRadius:12, padding:"10px 12px", lineHeight:1.6 };
