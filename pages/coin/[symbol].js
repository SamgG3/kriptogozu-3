// pages/coin/[symbol].js
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

/* ---------- küçük yardımcılar ---------- */
const fmt = (v, d = 2) =>
  v == null || isNaN(v)
    ? "—"
    : Number(v).toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPrice = (v) => {
  if (v == null || isNaN(v)) return "—";
  const a = Math.abs(v);
  const d = a >= 100 ? 2 : a >= 1 ? 4 : 6;
  return Number(v).toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
};
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const tp = (h, l, c) => (h + l + c) / 3;

/* ---------- temel seri matematiği ---------- */
const SMA = (arr, p) => {
  if (!arr || arr.length < p) return new Array(arr?.length || 0).fill(null);
  const out = new Array(arr.length).fill(null);
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    s += arr[i];
    if (i >= p) s -= arr[i - p];
    if (i >= p - 1) out[i] = s / p;
  }
  return out;
};
const EMA = (arr, p) => {
  if (!arr || arr.length < p) return new Array(arr?.length || 0).fill(null);
  const out = new Array(arr.length).fill(null);
  const k = 2 / (p + 1);
  let prev = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (i === 0) prev = v;
    else prev = v * k + prev * (1 - k);
    out[i] = i < p - 1 ? null : prev;
  }
  return out;
};
const RSI = (cl, p = 14) => {
  if (!cl || cl.length < p + 1) return new Array(cl?.length || 0).fill(null);
  const out = new Array(cl.length).fill(null);
  let g = 0,
    l = 0;
  for (let i = 1; i <= p; i++) {
    const ch = cl[i] - cl[i - 1];
    if (ch >= 0) g += ch;
    else l -= ch;
  }
  g /= p;
  l /= p;
  out[p] = 100 - 100 / (1 + (l === 0 ? Infinity : g / l));
  for (let i = p + 1; i < cl.length; i++) {
    const ch = cl[i] - cl[i - 1];
    const gg = ch > 0 ? ch : 0;
    const ll = ch < 0 ? -ch : 0;
    g = (g * (p - 1) + gg) / p;
    l = (l * (p - 1) + ll) / p;
    out[i] = 100 - 100 / (1 + (l === 0 ? Infinity : g / l));
  }
  return out;
};
const Stoch = (hi, lo, cl, kP = 14, dP = 3) => {
  const n = cl?.length || 0;
  const K = new Array(n).fill(null);
  const D = new Array(n).fill(null);
  if (!hi || !lo || !cl || n < kP) return { K, D };
  for (let i = kP - 1; i < n; i++) {
    let h = -Infinity,
      l = Infinity;
    for (let j = i - kP + 1; j <= i; j++) {
      if (hi[j] > h) h = hi[j];
      if (lo[j] < l) l = lo[j];
    }
    K[i] = h === l ? 50 : ((cl[i] - l) / (h - l)) * 100;
  }
  for (let i = 0; i < n; i++) {
    let s = 0,
      c = 0;
    for (let j = i - dP + 1; j <= i; j++) {
      if (j >= 0 && K[j] != null) {
        s += K[j];
        c++;
      }
    }
    D[i] = c ? s / c : null;
  }
  return { K, D };
};
const Bollinger = (cl, p = 20, mult = 2) => {
  const n = cl?.length || 0;
  const mid = SMA(cl, p);
  const up = new Array(n).fill(null);
  const low = new Array(n).fill(null);
  for (let i = p - 1; i < n; i++) {
    let s2 = 0;
    for (let j = i - p + 1; j <= i; j++) s2 += Math.pow(cl[j] - mid[i], 2);
    const sd = Math.sqrt(s2 / p);
    up[i] = mid[i] + mult * sd;
    low[i] = mid[i] - mult * sd;
  }
  return { mid, up, low };
};
const MACD = (cl, f = 12, s = 26, sig = 9) => {
  const fast = EMA(cl, f), slow = EMA(cl, s);
  const n = cl?.length || 0;
  const macd = new Array(n).fill(null);
  for (let i = 0; i < n; i++) macd[i] = fast[i] != null && slow[i] != null ? fast[i] - slow[i] : null;
  const signal = EMA(macd.map(v => v ?? 0), sig).map((v,i)=> macd[i]==null?null:v);
  const hist = macd.map((v,i)=> v==null||signal[i]==null?null: v - signal[i]);
  return { macd, signal, hist };
};
const ATR = (hi, lo, cl, p = 14) => {
  const n = cl?.length || 0;
  const out = new Array(n).fill(null);
  if (!hi || !lo || !cl || n < 2) return out;
  const tr = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const a = hi[i] - lo[i];
    const b = Math.abs(hi[i] - cl[i - 1]);
    const c = Math.abs(lo[i] - cl[i - 1]);
    tr[i] = Math.max(a, b, c);
  }
  let s = 0;
  for (let i = 1; i <= p; i++) s += tr[i];
  out[p] = s / p;
  for (let i = p + 1; i < n; i++) out[i] = (out[i - 1] * (p - 1) + tr[i]) / p;
  return out;
};
const ADX = (hi, lo, cl, p = 14) => {
  const n = cl?.length || 0;
  const out = new Array(n).fill(null);
  if (!hi || !lo || !cl || n < p + 1) return out;
  const tr = new Array(n).fill(0), plusDM = new Array(n).fill(0), minusDM = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const up = hi[i] - hi[i - 1];
    const dn = lo[i - 1] - lo[i];
    plusDM[i] = up > dn && up > 0 ? up : 0;
    minusDM[i] = dn > up && dn > 0 ? dn : 0;
    const _tr = Math.max(hi[i] - lo[i], Math.abs(hi[i] - cl[i - 1]), Math.abs(lo[i] - cl[i - 1]));
    tr[i] = _tr;
  }
  // Wilder smoothing
  let ATRs = 0, pDMs = 0, mDMs = 0;
  for (let i = 1; i <= p; i++) { ATRs += tr[i]; pDMs += plusDM[i]; mDMs += minusDM[i]; }
  let atr = ATRs, pDM = pDMs, mDM = mDMs;
  let pDI = 100 * (pDM / atr), mDI = 100 * (mDM / atr);
  let dx = 100 * (Math.abs(pDI - mDI) / (pDI + mDI || 1));
  let adx = dx;
  out[p] = adx;
  for (let i = p + 1; i < n; i++) {
    atr = atr - atr / p + tr[i];
    pDM = pDM - pDM / p + plusDM[i];
    mDM = mDM - mDM / p + minusDM[i];
    pDI = 100 * (pDM / (atr || 1));
    mDI = 100 * (mDM / (atr || 1));
    dx = 100 * (Math.abs(pDI - mDI) / ((pDI + mDI) || 1));
    adx = ((out[i - 1] ?? dx) * (p - 1) + dx) / p;
    out[i] = adx;
  }
  return out;
};
const MFI = (hi, lo, cl, vol, p = 14) => {
  const n = cl?.length || 0;
  const out = new Array(n).fill(null);
  if (!hi || !lo || !cl || !vol || n < p + 1) return out;
  const tpv = new Array(n).fill(0);
  for (let i = 0; i < n; i++) tpv[i] = tp(hi[i], lo[i], cl[i]) * vol[i];
  for (let i = p; i < n; i++) {
    let pos = 0, neg = 0;
    for (let j = i - p + 1; j <= i; j++) {
      const cur = tp(hi[j], lo[j], cl[j]);
      const prev = tp(hi[j - 1], lo[j - 1], cl[j - 1]);
      if (cur > prev) pos += tpv[j];
      else if (cur < prev) neg += tpv[j];
    }
    const ratio = neg === 0 ? Infinity : pos / neg;
    out[i] = 100 - 100 / (1 + ratio);
  }
  return out;
};
const VWAP = (hi, lo, cl, vol) => {
  const n = cl?.length || 0;
  const out = new Array(n).fill(null);
  if (!hi || !lo || !cl || !vol) return out;
  let cumPV = 0, cumV = 0;
  for (let i = 0; i < n; i++) {
    const _tp = tp(hi[i], lo[i], cl[i]);
    cumPV += _tp * vol[i];
    cumV += vol[i];
    out[i] = cumV ? cumPV / cumV : null;
  }
  return out;
};

/* ---------- swing & trend ---------- */
const swingsFromCloses = (cl, look = 3) => {
  const highs = [], lows = [];
  for (let i = look; i < cl.length - look; i++) {
    const w = cl.slice(i - look, i + look + 1);
    const hi = Math.max(...w), lo = Math.min(...w);
    if (cl[i] === hi) highs.push({ i, v: hi });
    if (cl[i] === lo) lows.push({ i, v: lo });
  }
  return { highs, lows };
};
const linregSlope = (vals=[]) => {
  const n = vals.length; if (n<2) return 0;
  let sx=0, sy=0, sxy=0, sxx=0;
  for (let i=0;i<n;i++){ const x=i+1, y=vals[i]; sx+=x; sy+=y; sxy+=x*y; sxx+=x*x; }
  const denom = n*sxx - sx*sx; if (!denom) return 0;
  return (n*sxy - sx*sy) / denom;
};
const trendBreakEMA = (latest, prev, closes) => {
  if (!latest || !prev) return { text:"—", color:"#9aa4b2" };
  const c = latest.close, e = latest.ema20, pc = prev.close, pe = prev.ema20;
  if (c!=null && e!=null && pc!=null && pe!=null){
    const slope = e - pe;
    if (c>e && pc<=pe && slope>=0) return { text:"Yukarı kırılım", color:"#22d39a" };
    if (c<e && pc>=pe && slope<=0) return { text:"Aşağı kırılım", color:"#ff6b6b" };
  }
  const m = linregSlope((closes||[]).slice(-50));
  if (m>0) return { text:"Yukarı eğim (zayıf)", color:"#22d39a" };
  if (m<0) return { text:"Aşağı eğim (zayıf)", color:"#ff6b6b" };
  return { text:"Net sinyal yok", color:"#9aa4b2" };
};

/* ---------- bileşik özet ---------- */
function makeIndicators({ highs, lows, closes, volume }) {
  const sma20 = SMA(closes,20), sma50=SMA(closes,50), sma200=SMA(closes,200);
  const ema20 = EMA(closes,20), ema50=EMA(closes,50), ema200=EMA(closes,200);
  const rsi14 = RSI(closes,14);
  const { K:stochK, D:stochD } = Stoch(highs,lows,closes,14,3);
  const { mid:bbMid, up:bbUpper, low:bbLower } = Bollinger(closes,20,2);
  const { macd, signal:macdSig, hist:macdHist } = MACD(closes,12,26,9);
  const atr14 = ATR(highs,lows,closes,14);
  const adx14 = ADX(highs,lows,closes,14);
  const mfi14 = volume ? MFI(highs,lows,closes,volume,14) : new Array(closes.length).fill(null);
  const vwap = volume ? VWAP(highs,lows,closes,volume) : new Array(closes.length).fill(null);
  const latest = (i)=> i!=null? i[i.length-1]: null;
  return {
    latestValues: {
      sma20: latest(sma20), sma50: latest(sma50), sma200: latest(sma200),
      ema20: latest(ema20), ema50: latest(ema50), ema200: latest(ema200),
      rsi14: latest(rsi14), stochK: latest(stochK), stochD: latest(stochD),
      bbUpper: latest(bbUpper), bbLower: latest(bbLower),
      macd: latest(macd), macdSig: latest(macdSig), macdHist: latest(macdHist),
      atr14: latest(atr14), adx14: latest(adx14), mfi14: latest(mfi14), vwap: latest(vwap),
    },
    series: { sma20, sma50, sma200, ema20, ema50, ema200, rsi14, stochK, stochD, bbUpper, bbLower, macd, macdSig, macdHist, atr14, adx14, mfi14, vwap }
  };
}

/* ---------- React component ---------- */
export default function CoinDetail() {
  const router = useRouter();
  const symbolParam = router.query.symbol;
  const symbol = useMemo(() => {
    if (!symbolParam) return null;
    const raw = String(symbolParam).toUpperCase();
    return raw.endsWith("USDT") ? raw : `${raw}USDT`;
  }, [symbolParam]);

  const [interval, setIntervalStr] = useState("1m");
  const [k, setK] = useState(null);             // ana interval candles
  const [k15, setK15] = useState(null);         // 15m candles (trend)
  const [ind, setInd] = useState(null);         // ana indikatörler
  const [trend15, setTrend15] = useState({ text:"—", color:"#9aa4b2" });
  const [loading, setLoading] = useState(false);

  const [tick, setTick] = useState({ last: null, chg: null });
  const [wsUp, setWsUp] = useState(false);
  const priceWS = useRef(null);

  // Whale/flow (>=100k$)
  const [flows, setFlows] = useState([]);
  const flowWS = useRef(null);

  // ---- veri yükleme: önce kendi API, olmazsa Binance klines fallback
  async function getCandles(sym, intv, limit=300){
    // 1) backend
    try{
      const r = await fetch(`/api/futures/indicators?symbol=${sym}&interval=${intv}&limit=${limit}`, {cache:"no-store"});
      const j = await r.json();
      if (Array.isArray(j?.candles) && j.candles.length){
        const H=j.candles.map(c=>+c.high), L=j.candles.map(c=>+c.low), C=j.candles.map(c=>+c.close), V=j.candles.map(c=>+c.volume ?? 0);
        return { highs:H, lows:L, closes:C, volume:V, latest:j.latest, prev:j.prev };
      }
      if (Array.isArray(j?.closes) && j.closes.length){
        const H=j.highs?.map(Number) ?? [], L=j.lows?.map(Number) ?? [], C=j.closes.map(Number), V=j.volume?.map(Number) ?? [];
        return { highs:H.length?H:undefined, lows:L.length?L:undefined, closes:C, volume:V.length?V:undefined, latest:j.latest, prev:j.prev };
      }
    }catch(e){/* fall back */}
    // 2) binance klines fallback
    const u = `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${intv}&limit=${limit}`;
    const r2 = await fetch(u); const a = await r2.json();
    if (Array.isArray(a)){
      const H=a.map(x=>+x[2]), L=a.map(x=>+x[3]), C=a.map(x=>+x[4]), V=a.map(x=>+x[5]);
      return { highs:H, lows:L, closes:C, volume:V };
    }
    return null;
  }

  async function loadAll(){
    if (!symbol) return;
    setLoading(true);
    try{
      const main = await getCandles(symbol, interval, 300);
      setK(main);
      const fifteen = await getCandles(symbol, "15m", 300);
      setK15(fifteen);

      if (main?.closes?.length){
        // indikatörleri hesapla
        const highs = main.highs ?? swingsFromCloses(main.closes).highs.map(x=>x.v);
        const lows  = main.lows  ?? swingsFromCloses(main.closes).lows.map(x=>x.v);
        const indPack = makeIndicators({
          highs: Array.isArray(highs)?highs:[], 
          lows: Array.isArray(lows)?lows:[],
          closes: main.closes, 
          volume: main.volume
        });
        setInd({ ...indPack.latestValues, closes: main.closes, highs, lows });
      } else {
        setInd(null);
      }

      // 15m trend
      if (fifteen?.closes?.length){
        // EMA20 trend kırılımı için "latest/prev" üret
        const ema20_15 = EMA(fifteen.closes,20);
        const latest = { close: fifteen.closes.at(-1), ema20: ema20_15.at(-1) };
        const prev   = { close: fifteen.closes.at(-2), ema20: ema20_15.at(-2) };
        setTrend15(trendBreakEMA(latest, prev, fifteen.closes));
      } else setTrend15({ text:"—", color:"#9aa4b2" });

    }finally{ setLoading(false); }
  }

  useEffect(()=>{ loadAll(); }, [symbol, interval]);

  // 3 sn’de bir yenile
  useEffect(()=>{ const t = setInterval(loadAll, 3000); return ()=> clearInterval(t); }, [symbol, interval]);

  // Price WS
  useEffect(()=>{
    if(!symbol) return;
    try{
      if (priceWS.current) { try{priceWS.current.close();}catch{} priceWS.current=null; }
      const url = `wss://fstream.binance.com/stream?streams=${symbol.toLowerCase()}@miniTicker`;
      const ws = new WebSocket(url); priceWS.current = ws;
      ws.onopen = ()=> setWsUp(true);
      ws.onclose = ()=> setWsUp(false);
      ws.onerror = ()=> setWsUp(false);
      ws.onmessage = (ev)=>{
        try{
          const d = JSON.parse(ev.data)?.data;
          if (d?.e === "24hrMiniTicker") setTick({ last:+d.c, chg:+d.P });
        }catch{}
      };
      return ()=> { try{ws.close();}catch{} };
    }catch{ setWsUp(false); }
  }, [symbol]);

  // Whale flow WS (>=100k USD)
  useEffect(()=>{
    if(!symbol) return;
    try{
      if (flowWS.current) { try{flowWS.current.close();}catch{} flowWS.current=null; }
      const url = `wss://fstream.binance.com/stream?streams=${symbol.toLowerCase()}@aggTrade`;
      const ws = new WebSocket(url); flowWS.current = ws;
      let lastPrice = null;
      ws.onmessage = (ev)=>{
        try{
          const d = JSON.parse(ev.data)?.data; // a:aggId, p:price, q:qty, m:isBuyerMaker
          if(!d) return;
          const price = +d.p, qty = +d.q, usd = price*qty;
          if (usd >= 100000){ // 100k
            // yön kestirimi: maker satıcı kabulü (yaklaşık)
            let side = d.m ? "SELL" : "BUY";
            if (lastPrice!=null && price>lastPrice) side="BUY";
            if (lastPrice!=null && price<lastPrice) side="SELL";
            lastPrice = price;
            setFlows((arr)=>{
              const next=[{t:Date.now(), side, price, qty, usd}, ...arr];
              return next.slice(0,50);
            });
          }
        }catch{}
      };
      return ()=> { try{ws.close();}catch{} };
    }catch{}
  }, [symbol]);

  // Entry & S/R & TP/SL
  const entry = tick.last ?? k?.closes?.at(-1) ?? null;
  const sr = useMemo(()=>{
    if (!k?.closes?.length || entry==null){
      return { supports:[], resistances:[] };
    }
    let highs = k.highs, lows = k.lows;
    if (!highs || !lows){
      const sw = swingsFromCloses(k.closes,3);
      highs = sw.highs.map(x=>x.v); lows = sw.lows.map(x=>x.v);
    }
    const up = highs.filter(v=>v>entry).sort((a,b)=>a-b).slice(0,3);
    const dn = lows.filter(v=>v<entry).sort((a,b)=>b-a).slice(0,3);
    return { supports:dn, resistances:up };
  }, [k?.closes, k?.highs, k?.lows, entry]);

  const longTP = [sr.resistances[0], sr.resistances[1], sr.resistances[2]];
  const shortTP= [sr.supports[0], sr.supports[1], sr.supports[2]];
  const longSL = sr.supports[0] ?? null;
  const shortSL= sr.resistances[0] ?? null;

  // indikatörlerin son değerleri (yoksa "—")
  const I = ind || {};

  return (
    <main style={{ padding:"14px 16px", fontSize:14, lineHeight:1.35 }}>
      <div style={{ marginBottom:10, display:"flex", gap:8, alignItems:"center" }}>
        <Link href="/" style={{ color:"#9bd0ff", textDecoration:"none" }}>← Ana Sayfa</Link>
        <span style={{ opacity:.6 }}>•</span>
        <span style={{ opacity:.8 }}>Sembol:</span>
        <b style={{ color:"#9bd0ff", fontSize:18 }}>{symbol || "—"}</b>
        <span style={{ marginLeft:10, opacity:.8 }}>Fiyat: <b>{fmtPrice(entry)}</b></span>
        <span style={{ marginLeft:8, color: tick.chg==null ? "#d0d6e6" : (tick.chg>=0?"#22d39a":"#ff6b6b"), fontWeight:800 }}>
          {tick.chg==null?"": (tick.chg>=0?"+":"")+fmt(tick.chg,2)+"%"}
        </span>
        <span style={{ marginLeft:8, opacity:.6 }}>WS: {wsUp?"Canlı":"—"}</span>

        <span style={{ marginLeft:"auto" }}>
          <select value={interval} onChange={e=>setIntervalStr(e.target.value)}
            style={{ padding:"6px 8px", background:"#121625", border:"1px solid #23283b", borderRadius:8, color:"#e6e6e6" }}>
            {["1m","5m","15m","1h","4h"].map(x=><option key={x} value={x}>{x}</option>)}
          </select>
          <button onClick={loadAll} disabled={loading}
            style={{ marginLeft:8, padding:"6px 10px", background:"#1a1f2e", border:"1px solid #2a2f45", borderRadius:8, color:"#fff", fontWeight:700 }}>
            {loading?"Yükleniyor…":"Yenile"}
          </button>
        </span>
      </div>

      {/* üst grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))", gap:10, marginBottom:10 }}>
        <Box title="Trend (15m)">
          <div><b style={{ color:trend15.color }}>{trend15.text}</b></div>
        </Box>

        <Box title="Entry / TP / SL (Long)">
          <div>Entry: <b>{fmtPrice(entry)}</b></div>
          <ul style={{ margin:"6px 0 0 18px" }}>
            <li>TP1: {fmtPrice(longTP[0])}</li>
            <li>TP2: {fmtPrice(longTP[1])}</li>
            <li>TP3: {fmtPrice(longTP[2])}</li>
            <li>SL:  {fmtPrice(longSL)}</li>
          </ul>
        </Box>

        <Box title="Entry / TP / SL (Short)">
          <div>Entry: <b>{fmtPrice(entry)}</b></div>
          <ul style={{ margin:"6px 0 0 18px" }}>
            <li>TP1: {fmtPrice(shortTP[0])}</li>
            <li>TP2: {fmtPrice(shortTP[1])}</li>
            <li>TP3: {fmtPrice(shortTP[2])}</li>
            <li>SL:  {fmtPrice(shortSL)}</li>
          </ul>
        </Box>

        <Box title="Destek / Direnç">
          <div>Destek: {sr.supports?.length ? sr.supports.map(v=>fmtPrice(v)).join(" • ") : "—"}</div>
          <div style={{ marginTop:4 }}>Direnç: {sr.resistances?.length ? sr.resistances.map(v=>fmtPrice(v)).join(" • ") : "—"}</div>
        </Box>
      </div>

      {/* indikatör tablosu */}
      <Box title="İndikatörler (son değer)">
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", fontSize:13 }}>
            <tbody>
              <Row name="SMA20" v={I.sma20} /><Row name="SMA50" v={I.sma50} /><Row name="SMA200" v={I.sma200} />
              <Row name="EMA20" v={I.ema20} /><Row name="EMA50" v={I.ema50} /><Row name="EMA200" v={I.ema200} />
              <Row name="RSI14" v={I.rsi14} d={2} />
              <Row name="Stoch K" v={I.stochK} d={2} /><Row name="Stoch D" v={I.stochD} d={2} />
              <Row name="MACD" v={I.macd} d={4} /><Row name="MACD Signal" v={I.macdSig} d={4} /><Row name="MACD Hist" v={I.macdHist} d={4} />
              <Row name="BB Upper" v={I.bbUpper} /><Row name="BB Lower" v={I.bbLower} />
              <Row name="ATR14" v={I.atr14} d={4} />
              <Row name="ADX14" v={I.adx14} d={2} />
              <Row name="MFI14" v={I.mfi14} d={2} />
              <Row name="VWAP" v={I.vwap} />
            </tbody>
          </table>
        </div>
      </Box>

      {/* Whale flow */}
      <Box title="Anlık Para Akışı (≥ $100k)">
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          {!flows.length && <div style={{ opacity:.7 }}>Henüz kayıt yok…</div>}
          {flows.map((it,idx)=>(
            <div key={idx} style={{ display:"grid", gridTemplateColumns:"80px 1fr 1fr 1fr", gap:8, padding:"6px 0", borderTop:"1px solid #1f2742" }}>
              <div style={{ opacity:.7 }}>{new Date(it.t).toLocaleTimeString("tr-TR")}</div>
              <div style={{ fontWeight:800, color: it.side==="BUY" ? "#22d39a" : "#ff6b6b" }}>{it.side}</div>
              <div style={{ textAlign:"right" }}>Fiyat: <b>{fmtPrice(it.price)}</b></div>
              <div style={{ textAlign:"right" }}>USD: <b>{fmt(it.usd,0)}</b> — Adet: <b>{fmt(it.qty,4)}</b></div>
            </div>
          ))}
        </div>
      </Box>

      <div style={{ opacity:.7, fontSize:12, marginTop:8 }}>
        Otomatik S/R & trend hesaplaması kullanılır — yanılma payı vardır. Bu bilgiler yatırım tavsiyesi değildir.
      </div>
    </main>
  );
}

/* ---------- küçük görsel parçalar ---------- */
function Box({ title, children }) {
  return (
    <div style={{ background:"#121a33", border:"1px solid #202945", borderRadius:10, padding:12, color:"#e6edf6", marginBottom:10 }}>
      <div style={{ fontWeight:800, marginBottom:6, color:"#9bd0ff" }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ name, v, d=2 }) {
  return (
    <tr>
      <td style={{ opacity:.85 }}>{name}</td>
      <td style={{ textAlign:"right", fontWeight:700 }}>{fmtPrice(v ?? (typeof v==="number"?v:null))}</td>
    </tr>
  );
}
