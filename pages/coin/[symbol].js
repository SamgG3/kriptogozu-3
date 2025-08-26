// pages/coin/[symbol].js
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

/* ================== Helpers ================== */
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

const unique = (arr) => Array.from(new Set(arr));

/* ================== Math / Indicators ================== */
const SMA = (arr, p) => {
  const n = arr?.length || 0;
  const out = new Array(n).fill(null);
  if (!arr || n < p) return out;
  let s = 0;
  for (let i = 0; i < n; i++) {
    s += arr[i];
    if (i >= p) s -= arr[i - p];
    if (i >= p - 1) out[i] = s / p;
  }
  return out;
};
const EMA = (arr, p) => {
  const n = arr?.length || 0;
  const out = new Array(n).fill(null);
  if (!arr || n < p) return out;
  const k = 2 / (p + 1);
  let prev = arr[0];
  for (let i = 0; i < n; i++) {
    const v = arr[i];
    prev = i === 0 ? v : v * k + prev * (1 - k);
    out[i] = i < p - 1 ? null : prev;
  }
  return out;
};
const RSI = (cl, p = 14) => {
  const n = cl?.length || 0;
  const out = new Array(n).fill(null);
  if (!cl || n < p + 1) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) {
    const ch = cl[i] - cl[i - 1];
    if (ch >= 0) g += ch; else l -= ch;
  }
  g /= p; l /= p;
  out[p] = 100 - 100 / (1 + (l === 0 ? Infinity : g / l));
  for (let i = p + 1; i < n; i++) {
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
  const n = cl?.length || 0, K = new Array(n).fill(null), D = new Array(n).fill(null);
  if (!hi || !lo || !cl || n < kP) return { K, D };
  for (let i = kP - 1; i < n; i++) {
    let h = -Infinity, l = Infinity;
    for (let j = i - kP + 1; j <= i; j++) { if (hi[j] > h) h = hi[j]; if (lo[j] < l) l = lo[j]; }
    K[i] = h === l ? 50 : ((cl[i] - l) / (h - l)) * 100;
  }
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let j = i - dP + 1; j <= i; j++) if (j >= 0 && K[j] != null) { s += K[j]; c++; }
    D[i] = c ? s / c : null;
  }
  return { K, D };
};
const Bollinger = (cl, p = 20, mult = 2) => {
  const n = cl?.length || 0, mid = SMA(cl, p), up = new Array(n).fill(null), low = new Array(n).fill(null);
  for (let i = p - 1; i < n; i++) {
    let s2 = 0; for (let j = i - p + 1; j <= i; j++) s2 += Math.pow(cl[j] - mid[i], 2);
    const sd = Math.sqrt(s2 / p); up[i] = mid[i] + mult * sd; low[i] = mid[i] - mult * sd;
  }
  return { mid, up, low };
};
const MACD = (cl, f = 12, s = 26, sig = 9) => {
  const fast = EMA(cl, f), slow = EMA(cl, s), n = cl?.length || 0;
  const macd = new Array(n).fill(null);
  for (let i = 0; i < n; i++) macd[i] = fast[i] != null && slow[i] != null ? fast[i] - slow[i] : null;
  const signal = EMA(macd.map(v => v ?? 0), sig).map((v, i) => macd[i] == null ? null : v);
  const hist = macd.map((v, i) => v == null || signal[i] == null ? null : v - signal[i]);
  return { macd, signal, hist };
};
const ATR = (hi, lo, cl, p = 14) => {
  const n = cl?.length || 0, out = new Array(n).fill(null);
  if (!hi || !lo || !cl || n < 2) return out;
  const tr = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const a = hi[i] - lo[i], b = Math.abs(hi[i] - cl[i - 1]), c = Math.abs(lo[i] - cl[i - 1]);
    tr[i] = Math.max(a, b, c);
  }
  let s = 0; for (let i = 1; i <= p; i++) s += tr[i];
  out[p] = s / p;
  for (let i = p + 1; i < n; i++) out[i] = (out[i - 1] * (p - 1) + tr[i]) / p;
  return out;
};
const ADX = (hi, lo, cl, p = 14) => {
  const n = cl?.length || 0, out = new Array(n).fill(null);
  if (!hi || !lo || !cl || n < p + 1) return out;
  const tr = new Array(n).fill(0), plusDM = new Array(n).fill(0), minusDM = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const up = hi[i] - hi[i - 1], dn = lo[i - 1] - lo[i];
    plusDM[i] = up > dn && up > 0 ? up : 0;
    minusDM[i] = dn > up && dn > 0 ? dn : 0;
    tr[i] = Math.max(hi[i] - lo[i], Math.abs(hi[i] - cl[i - 1]), Math.abs(lo[i] - cl[i - 1]));
  }
  let atr = 0, pDM = 0, mDM = 0;
  for (let i = 1; i <= p; i++) { atr += tr[i]; pDM += plusDM[i]; mDM += minusDM[i]; }
  let pDI = 100 * (pDM / atr), mDI = 100 * (mDM / atr);
  let dx = 100 * (Math.abs(pDI - mDI) / ((pDI + mDI) || 1)), adx = dx;
  out[p] = adx;
  for (let i = p + 1; i < n; i++) {
    atr = atr - atr / p + tr[i];
    pDM = pDM - pDM / p + plusDM[i];
    mDM = mDM - mDM / p + minusDM[i];
    pDI = 100 * (pDM / (atr || 1)); mDI = 100 * (mDM / (atr || 1));
    dx = 100 * (Math.abs(pDI - mDI) / ((pDI + mDI) || 1));
    adx = ((out[i - 1] ?? dx) * (p - 1) + dx) / p; out[i] = adx;
  }
  return out;
};
const MFI = (hi, lo, cl, vol, p = 14) => {
  const n = cl?.length || 0, out = new Array(n).fill(null);
  if (!hi || !lo || !cl || !vol || n < p + 1) return out;
  for (let i = p; i < n; i++) {
    let pos = 0, neg = 0;
    for (let j = i - p + 1; j <= i; j++) {
      const cur = tp(hi[j], lo[j], cl[j]), prev = tp(hi[j - 1], lo[j - 1], cl[j - 1]);
      const mf = cur * vol[j];
      if (cur > prev) pos += mf; else if (cur < prev) neg += mf;
    }
    const ratio = neg === 0 ? Infinity : pos / neg;
    out[i] = 100 - 100 / (1 + ratio);
  }
  return out;
};
const VWAP = (hi, lo, cl, vol) => {
  const n = cl?.length || 0, out = new Array(n).fill(null);
  if (!hi || !lo || !cl || !vol) return out;
  let cumPV = 0, cumV = 0;
  for (let i = 0; i < n; i++) {
    const _tp = tp(hi[i], lo[i], cl[i]); cumPV += _tp * vol[i]; cumV += vol[i]; out[i] = cumV ? cumPV / cumV : null;
  }
  return out;
};

/* ================== SR / Trend / Resample ================== */
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
const trendBreakEMA = (closes) => {
  if (!closes || closes.length < 22) return "—";
  const ema20 = EMA(closes, 20);
  const c = closes.at(-1), p = closes.at(-2), e = ema20.at(-1), pe = ema20.at(-2);
  if (c == null || p == null || e == null || pe == null) return "—";
  const slope = e - pe;
  if (c > e && p <= pe && slope >= 0) return "Yukarı";
  if (c < e && p >= pe && slope <= 0) return "Aşağı";
  return "Net değil";
};
const biasByEMA = (closes) => {
  if (!closes || closes.length < 22) return "—";
  const ema20 = EMA(closes, 20);
  const c = closes.at(-1), e = ema20.at(-1), slope = e - ema20.at(-2);
  if (c > e && slope >= 0) return "LONG";
  if (c < e && slope <= 0) return "SHORT";
  return "NÖTR";
};
// Günlük diziden sentetik gruplama (hafta/ay vb.)
const resampleCloses = (dailyCloses, groupN) => {
  if (!dailyCloses?.length || groupN <= 1) return dailyCloses;
  const out = [];
  for (let i = 0; i < dailyCloses.length; i += groupN) out.push(dailyCloses[Math.min(i + groupN - 1, dailyCloses.length - 1)]);
  return out;
};

/* ================== React ================== */
export default function CoinDetail() {
  const router = useRouter();
  const symbolParam = router.query.symbol;
  const symbol = useMemo(() => {
    if (!symbolParam) return null;
    const raw = String(symbolParam).toUpperCase();
    return raw.endsWith("USDT") ? raw : `${raw}USDT`;
  }, [symbolParam]);

  // seçili interval (grafik hesapları)
  const [interval, setIntervalStr] = useState("1m");

  // canlı fiyat
  const [tick, setTick] = useState({ last: null, chg: null });
  const [wsUp, setWsUp] = useState(false);
  const priceWS = useRef(null);

  // ana interval verisi (cl/h/l/v) + indikatör son değerleri
  const [main, setMain] = useState(null);
  const [indLast, setIndLast] = useState(null);

  // MTF (multi-timeframe) closes haritaları
  const [mtf, setMtf] = useState({}); // { "1m": closes[], "3m": closes[], ... , "1d": closes[] }
  const [trend, setTrend] = useState({}); // { "5m": "Yukarı/..." , ... }
  const [bias, setBias] = useState({});   // { "1m": "LONG/SHORT/..." , ... }

  // Whale flow (>=100k)
  const [flows, setFlows] = useState([]);
  const flowWS = useRef(null);

  const entry = tick.last ?? main?.closes?.at(-1) ?? null;

  /* ----- Fetch helpers ----- */
  async function fromBackend(sym, intv, limit = 300) {
    const r = await fetch(`/api/futures/indicators?symbol=${sym}&interval=${intv}&limit=${limit}`, { cache: "no-store" });
    const j = await r.json();
    if (Array.isArray(j?.candles) && j.candles.length) {
      const H = j.candles.map(c => +c.high), L = j.candles.map(c => +c.low), C = j.candles.map(c => +c.close), V = j.candles.map(c => +c.volume ?? 0);
      return { H, L, C, V, latest: j.latest, prev: j.prev };
    }
    if (Array.isArray(j?.closes) && j.closes.length) {
      const H = j.highs?.map(Number), L = j.lows?.map(Number), C = j.closes.map(Number), V = j.volume?.map(Number);
      return { H, L, C, V, latest: j.latest, prev: j.prev };
    }
    return null;
  }
  async function fromBinance(sym, intv, limit = 300) {
    const u = `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${intv}&limit=${limit}`;
    const r = await fetch(u);
    const a = await r.json();
    if (!Array.isArray(a)) return null;
    const H = a.map(x => +x[2]), L = a.map(x => +x[3]), C = a.map(x => +x[4]), V = a.map(x => +x[5]);
    return { H, L, C, V };
  }
  async function getCandles(sym, intv, limit = 300) {
    try {
      const b = await fromBackend(sym, intv, limit);
      if (b) return b;
    } catch {}
    return await fromBinance(sym, intv, limit);
  }

  /* ----- Load MAIN (3s) ----- */
  async function loadMain() {
    if (!symbol) return;
    const d = await getCandles(symbol, interval, 300);
    if (!d) return;
    setMain({ highs: d.H, lows: d.L, closes: d.C, volume: d.V, latest: d.latest, prev: d.prev });
    // indicators on main interval
    const ema20 = EMA(d.C, 20), ema50 = EMA(d.C, 50), ema200 = EMA(d.C, 200);
    const rsi14 = RSI(d.C, 14);
    const { K: stochK, D: stochD } = Stoch(d.H, d.L, d.C, 14, 3);
    const { up: bbUpper, low: bbLower } = Bollinger(d.C, 20, 2);
    const { macd, signal: macdSig, hist: macdHist } = MACD(d.C, 12, 26, 9);
    const atr14 = ATR(d.H, d.L, d.C, 14);
    const adx14 = ADX(d.H, d.L, d.C, 14);
    const mfi14 = d.V ? MFI(d.H, d.L, d.C, d.V, 14) : new Array(d.C.length).fill(null);
    const vwap = d.V ? VWAP(d.H, d.L, d.C, d.V) : new Array(d.C.length).fill(null);

    setIndLast({
      sma20: SMA(d.C, 20).at(-1), sma50: SMA(d.C, 50).at(-1), sma200: SMA(d.C, 200).at(-1),
      ema20: ema20.at(-1), ema50: ema50.at(-1), ema200: ema200.at(-1),
      rsi14: rsi14.at(-1), stochK: stochK.at(-1), stochD: stochD.at(-1),
      bbUpper: bbUpper.at(-1), bbLower: bbLower.at(-1),
      macd: macd.at(-1), macdSig: macdSig.at(-1), macdHist: macdHist.at(-1),
      atr14: atr14.at(-1), adx14: adx14.at(-1), mfi14: mfi14.at(-1), vwap: vwap.at(-1),
    });
  }

  /* ----- Load MTF (12s) ----- */
  const trendTFs = ["5m", "15m", "1h", "4h", "1d"];
  const biasTFs = ["1m","3m","5m","15m","30m","1h","2h","3h","4h","12h","1d","3d","1w","3w","1M","3M","6M","12M"];
  const nativeTFs = ["1m","3m","5m","15m","30m","1h","2h","3h","4h","12h","1d"]; // Binance native
  async function loadMTF() {
    if (!symbol) return;
    // fetch native closes in parallel
    const pairs = await Promise.all(nativeTFs.map(async tf => {
      const d = await getCandles(symbol, tf, 300);
      return [tf, d?.C || []];
    }));
    const map = Object.fromEntries(pairs);
    setMtf(map);

    // trend (EMA20 kırılımları) – doğrudan native kullan, 1d zaten var
    const t = {};
    for (const tf of trendTFs) t[tf] = trendBreakEMA(map[tf]);
    // bias grid
    const b = {};
    // dak/h saat/gün native
    for (const tf of nativeTFs) b[tf] = biasByEMA(map[tf]);
    // sentetik: 3d, 1w, 3w, 1M, 3M, 6M, 12M (günlükten üret)
    const daily = map["1d"] || [];
    const make = (label, n) => (b[label] = biasByEMA(resampleCloses(daily, n)));
    make("3d", 3);
    make("1w", 7);
    make("3w", 21);
    make("1M", 30);
    make("3M", 90);
    make("6M", 180);
    make("12M", 365);

    setTrend(t);
    setBias(b);
  }

  /* ----- Timers ----- */
  useEffect(() => { loadMain(); }, [symbol, interval]);
  useEffect(() => { const t = setInterval(loadMain, 3000); return () => clearInterval(t); }, [symbol, interval]);
  useEffect(() => { loadMTF(); }, [symbol]);
  useEffect(() => { const t = setInterval(loadMTF, 12000); return () => clearInterval(t); }, [symbol]);

  /* ----- WS price ----- */
  useEffect(() => {
    if (!symbol) return;
    try {
      if (priceWS.current) { try { priceWS.current.close(); } catch {} priceWS.current = null; }
      const url = `wss://fstream.binance.com/stream?streams=${symbol.toLowerCase()}@miniTicker`;
      const ws = new WebSocket(url); priceWS.current = ws;
      ws.onopen = () => setWsUp(true);
      ws.onclose = () => setWsUp(false);
      ws.onerror = () => setWsUp(false);
      ws.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data)?.data;
          if (d?.e === "24hrMiniTicker") setTick({ last: +d.c, chg: +d.P });
        } catch {}
      };
      return () => { try { ws.close(); } catch {} };
    } catch {
      setWsUp(false);
    }
  }, [symbol]);

  /* ----- WS whale flow (>=100k USD) ----- */
  useEffect(() => {
    if (!symbol) return;
    try {
      if (flowWS.current) { try { flowWS.current.close(); } catch {} flowWS.current = null; }
      const url = `wss://fstream.binance.com/stream?streams=${symbol.toLowerCase()}@aggTrade`;
      const ws = new WebSocket(url); flowWS.current = ws;
      let lastPrice = null;
      ws.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data)?.data; // p,q,m
          if (!d) return;
          const price = +d.p, qty = +d.q, usd = price * qty;
          if (usd >= 100000) {
            let side = d.m ? "SELL" : "BUY";
            if (lastPrice != null && price > lastPrice) side = "BUY";
            if (lastPrice != null && price < lastPrice) side = "SELL";
            lastPrice = price;
            setFlows((arr) => [{ t: Date.now(), side, price, qty, usd }, ...arr].slice(0, 50));
          }
        } catch {}
      };
      return () => { try { ws.close(); } catch {} };
    } catch {}
  }, [symbol]);

  /* ----- SR & TP/SL ----- */
  const sr = useMemo(() => {
    const C = main?.closes || [];
    const price = entry;
    if (!C.length || price == null) return { supports: [], resistances: [] };
    let highs = main?.highs, lows = main?.lows;
    if (!highs || !lows) { const sw = swingsFromCloses(C, 3); highs = sw.highs.map(x => x.v); lows = sw.lows.map(x => x.v); }
    const up = highs.filter(v => v > price).sort((a, b) => a - b).slice(0, 3);
    const dn = lows.filter(v => v < price).sort((a, b) => b - a).slice(0, 3);
    return { supports: dn, resistances: up };
  }, [main?.closes, main?.highs, main?.lows, entry]);

  const longTP = [sr.resistances[0], sr.resistances[1], sr.resistances[2]];
  const shortTP = [sr.supports[0], sr.supports[1], sr.supports[2]];
  const longSL = sr.supports[0] ?? null;
  const shortSL = sr.resistances[0] ?? null;

  /* ----- UI ----- */
  return (
    <main style={{ padding: "14px 16px", fontSize: 14, lineHeight: 1.35 }}>
      {/* Header */}
      <div style={{ marginBottom: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Link href="/" style={{ color: "#9bd0ff", textDecoration: "none" }}>← Ana Sayfa</Link>
        <span style={{ opacity: .6 }}>•</span>
        <span style={{ opacity: .8 }}>Sembol:</span>
        <b style={{ color: "#9bd0ff", fontSize: 18 }}>{symbol || "—"}</b>
        <span style={{ marginLeft: 10, opacity: .8 }}>Entry: <b>{fmtPrice(entry)}</b></span>
        <span style={{ marginLeft: 8, color: tick.chg == null ? "#d0d6e6" : (tick.chg >= 0 ? "#22d39a" : "#ff6b6b"), fontWeight: 800 }}>
          {tick.chg == null ? "" : (tick.chg >= 0 ? "+" : "") + fmt(tick.chg, 2) + "%"}
        </span>
        <span style={{ marginLeft: 8, opacity: .6 }}>WS: {wsUp ? "Canlı" : "—"}</span>
        <span style={{ marginLeft: "auto" }}>
          <select value={interval} onChange={(e) => setIntervalStr(e.target.value)}
            style={{ padding: "6px 8px", background: "#121625", border: "1px solid #23283b", borderRadius: 8, color: "#e6e6e6" }}>
            {["1m", "3m", "5m", "15m", "30m", "1h", "2h", "3h", "4h", "12h", "1d"].map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </span>
      </div>

      {/* Trend kırılımları (5m,15m,1h,4h,1d) */}
      <Box title="Trend Kırılımları (EMA20)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
          {["5m","15m","1h","4h","1d"].map(tf => (
            <Chip key={tf} label={tf.toUpperCase()} val={trend[tf]} />
          ))}
        </div>
      </Box>

      {/* Entry / TP / SL */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10, marginBottom: 10 }}>
        <Box title="Entry / TP / SL (Long)">
          <div>Entry: <b>{fmtPrice(entry)}</b></div>
          <ul style={{ margin: "6px 0 0 18px" }}>
            <li>TP1: {fmtPrice(longTP[0])}</li>
            <li>TP2: {fmtPrice(longTP[1])}</li>
            <li>TP3: {fmtPrice(longTP[2])}</li>
            <li>SL:  {fmtPrice(longSL)}</li>
          </ul>
        </Box>
        <Box title="Entry / TP / SL (Short)">
          <div>Entry: <b>{fmtPrice(entry)}</b></div>
          <ul style={{ margin: "6px 0 0 18px" }}>
            <li>TP1: {fmtPrice(shortTP[0])}</li>
            <li>TP2: {fmtPrice(shortTP[1])}</li>
            <li>TP3: {fmtPrice(shortTP[2])}</li>
            <li>SL:  {fmtPrice(shortSL)}</li>
          </ul>
        </Box>
        <Box title="Destek / Direnç">
          <div>Destek: {sr.supports?.length ? sr.supports.map(v => fmtPrice(v)).join(" • ") : "—"}</div>
          <div style={{ marginTop: 4 }}>Direnç: {sr.resistances?.length ? sr.resistances.map(v => fmtPrice(v)).join(" • ") : "—"}</div>
        </Box>
      </div>

      {/* İndikatörler (kompakt tablo) + Akış yan yana */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(320px, 1fr)", gap: 10, alignItems: "start" }}>
        <Box title="İndikatörler (son)">
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <tbody>
              {IndRow("SMA20", indLast?.sma20)}
              {IndRow("SMA50", indLast?.sma50)}
              {IndRow("SMA200", indLast?.sma200)}
              {IndRow("EMA20", indLast?.ema20)}
              {IndRow("EMA50", indLast?.ema50)}
              {IndRow("EMA200", indLast?.ema200)}
              {IndRow("RSI14", indLast?.rsi14, 2)}
              {IndRow("Stoch K", indLast?.stochK, 2)}
              {IndRow("Stoch D", indLast?.stochD, 2)}
              {IndRow("MACD", indLast?.macd, 4)}
              {IndRow("MACD Sig", indLast?.macdSig, 4)}
              {IndRow("MACD Hist", indLast?.macdHist, 4)}
              {IndRow("BB Üst", indLast?.bbUpper)}
              {IndRow("BB Alt", indLast?.bbLower)}
              {IndRow("ATR14", indLast?.atr14, 4)}
              {IndRow("ADX14", indLast?.adx14, 2)}
              {IndRow("MFI14", indLast?.mfi14, 2)}
              {IndRow("VWAP", indLast?.vwap)}
            </tbody>
          </table>
        </Box>

        <Box title="Anlık Para Akışı (≥ $100k)">
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {!flows.length && <div style={{ opacity: .7 }}>Henüz kayıt yok…</div>}
            {flows.map((it, idx) => (
              <div key={idx} style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr 1fr", gap: 8, padding: "6px 0", borderTop: "1px solid #1f2742" }}>
                <div style={{ opacity: .7 }}>{new Date(it.t).toLocaleTimeString("tr-TR")}</div>
                <div style={{ fontWeight: 800, color: it.side === "BUY" ? "#22d39a" : "#ff6b6b" }}>{it.side}</div>
                <div style={{ textAlign: "right" }}>Fiyat: <b>{fmtPrice(it.price)}</b></div>
                <div style={{ textAlign: "right" }}>USD: <b>{fmt(it.usd, 0)}</b> — Adet: <b>{fmt(it.qty, 4)}</b></div>
              </div>
            ))}
          </div>
        </Box>
      </div>

      {/* Yön Matrisi */}
      <Box title="Yön Matrisi (EMA20 tabanlı)">
        <div style={{ display: "grid", gap: 10 }}>
          <RowMatrix label="Dakika" list={["1m","3m","5m","15m","30m"]} bias={bias} />
          <RowMatrix label="Saat"   list={["1h","2h","3h","4h","12h"]}  bias={bias} />
          <RowMatrix label="Gün"    list={["1d","3d"]}                  bias={bias} />
          <RowMatrix label="Hafta"  list={["1w","3w"]}                  bias={bias} />
          <RowMatrix label="Ay"     list={["1M","3M","6M","12M"]}       bias={bias} />
        </div>
      </Box>

      <div style={{ opacity: .7, fontSize: 12, marginTop: 8 }}>
        Otomatik hesaplamadır; hata payı vardır. Bu içerik yatırım tavsiyesi değildir.
      </div>
    </main>
  );
}

/* ================== Tiny UI Parts ================== */
function Box({ title, children }) {
  return (
    <div style={{ background: "#121a33", border: "1px solid #202945", borderRadius: 10, padding: 12, color: "#e6edf6", marginBottom: 10 }}>
      <div style={{ fontWeight: 800, marginBottom: 6, color: "#9bd0ff" }}>{title}</div>
      {children}
    </div>
  );
}
function Chip({ label, val }) {
  const map = { "Yukarı": "#22d39a", "Aşağı": "#ff6b6b", "Net değil": "#ffb04a", "—": "#9aa4b2" };
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 10px", border: "1px solid #202945", borderRadius: 8 }}>
      <span style={{ opacity: .85 }}>{label}</span>
      <b style={{ color: map[val] || "#cfe2ff" }}>{val || "—"}</b>
    </div>
  );
}
function IndRow(name, v, d = 2) {
  return (
    <tr>
      <td style={{ padding: "6px 0", opacity: .85 }}>{name}</td>
      <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 700 }}>{v == null ? "—" : fmtPrice(typeof v === "number" ? v : Number(v))}</td>
    </tr>
  );
}
function RowMatrix({ label, list, bias }) {
  const color = (b) => b === "LONG" ? "#22d39a" : b === "SHORT" ? "#ff6b6b" : "#9aa4b2";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "90px repeat(auto-fit, minmax(80px, 1fr))", gap: 8, alignItems: "center" }}>
      <div style={{ opacity: .8 }}>{label}</div>
      {list.map(tf => (
        <div key={tf} style={{ padding: "6px 8px", border: "1px solid #202945", borderRadius: 8, textAlign: "center", fontWeight: 800, color: color(bias[tf]) }}>
          {tf.toUpperCase()} • {bias[tf] || "—"}
        </div>
      ))}
    </div>
  );
}
