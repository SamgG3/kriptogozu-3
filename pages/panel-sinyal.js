// pages/panel-sinyal.js
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

/* ===== Erişim: sadece kurucu / yonetici / arkadas ===== */
const ALLOWED_ROLES = new Set(["kurucu", "yonetici", "arkadas"]);

/* ===== Yardımcılar ===== */
const fmt = (v, d = 2) =>
  v == null || isNaN(v)
    ? "—"
    : Number(v).toLocaleString("tr-TR", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      });

function bandPos(L) {
  const c = L?.close,
    bu = L?.bbUpper,
    bl = L?.bbLower;
  if (c == null || bu == null || bl == null || bu === bl) return null;
  return ((c - bl) / (bu - bl)) * 100;
}
function bbWidthPct(L) {
  const c = L?.close,
    bu = L?.bbUpper,
    bl = L?.bbLower;
  if (c == null || bu == null || bl == null) return null;
  return (bu - bl) / c;
}
function momentumScore(L) {
  if (!L) return 0;
  let s = 0;
  if (L.rsi14 != null) {
    if (L.rsi14 >= 55) s += 1;
    if (L.rsi14 <= 45) s -= 1;
  }
  if (L.stochK != null && L.stochD != null) {
    if (L.stochK > L.stochD) s += 1;
    if (L.stochK < L.stochD) s -= 1;
  }
  if (L.close != null && L.ema20 != null) {
    if (L.close > L.ema20) s += 1;
    else s -= 1;
  }
  const bp = bandPos(L);
  if (bp != null) {
    if (bp >= 55) s += 0.5;
    if (bp <= 45) s -= 0.5;
  }
  return s;
}
const IV_WEIGHT = { "1m": 0.9, "3m": 0.9, "5m": 1.0, "15m": 1.2, "30m": 1.1, "1h": 1.4, "4h": 1.0 };

function decideDirection(frames) {
  let wsum = 0,
    wtot = 0;
  for (const [iv, L] of Object.entries(frames)) {
    const w = IV_WEIGHT[iv] ?? 1;
    wsum += momentumScore(L) * w;
    wtot += w;
  }
  const avg = wtot ? wsum / wtot : 0;
  if (avg >= 1.0) return { dir: "LONG", conf: Math.min(1, avg / 3.5) };
  if (avg <= -1.0) return { dir: "SHORT", conf: Math.min(1, -avg / 3.5) };
  return { dir: "NEUTRAL", conf: 0.3 };
}
function reasonsText(frames, potTxt, notes) {
  const p = [];
  const brief = (tag, L) => {
    if (!L) return;
    if (L.rsi14 != null) p.push(`${tag} RSI=${fmt(L.rsi14, 0)}`);
    if (L.stochK != null && L.stochD != null) p.push(`${tag} Stoch ${L.stochK > L.stochD ? "↑" : L.stochK < L.stochD ? "↓" : "="}`);
    if (L.close != null && L.ema20 != null) p.push(`${tag} ${L.close > L.ema20 ? "EMA20 üstü" : "EMA20 altı"}`);
  };
  ["1m", "3m", "5m", "15m", "30m", "1h", "4h"].forEach((iv) => frames[iv] && brief(iv, frames[iv]));
  if (potTxt) p.push(potTxt);
  (notes || []).forEach((n) => p.push(n));
  return p.slice(0, 6).join(" • ");
}

/* ===== API yardımcıları ===== */
async function getLatest(symbol, interval) {
  try {
    const r = await fetch(`/api/futures/indicators?symbol=${symbol}&interval=${interval}&limit=200`, { cache: "no-store" });
    const j = await r.json();
    return j?.latest || null;
  } catch {
    return null;
  }
}
async function getSeries(symbol, interval, limit = 300) {
  try {
    const r = await fetch(`/api/futures/indicators?symbol=${symbol}&interval=${interval}&limit=${limit}`, { cache: "no-store" });
    const j = await r.json();
    return Array.isArray(j?.rows) ? j.rows : [];
  } catch {
    return [];
  }
}
async function getMetrics(symbol) {
  try {
    const r = await fetch(`/api/futures/metrics?symbol=${symbol}&lookback=15m`, { cache: "no-store" });
    const j = await r.json();
    return {
      oiChangePct: Number(j?.oiChangePct) || 0,
      fundingRate: Number(j?.fundingRate) || 0,
      whaleNetflowUsd: Number(j?.whaleNetflowUsd) || 0,
    };
  } catch {
    return { oiChangePct: 0, fundingRate: 0, whaleNetflowUsd: 0 };
  }
}

/* ===== ATR hesaplama (fallback) ===== */
function ema(prev, value, k) {
  if (prev == null) return value;
  return prev + k * (value - prev);
}
function computeATR14FromSeries(rows) {
  if (!rows?.length) return null;
  // rows beklenen: { high, low, close } ve önceki kapanış; yoksa kabaca HL kullanırız
  let prevClose = rows[0]?.close;
  const period = 14;
  const k = 2 / (period + 1);
  let atr = null;
  for (let i = 1; i < rows.length; i++) {
    const h = Number(rows[i].high ?? rows[i].close ?? 0);
    const l = Number(rows[i].low ?? rows[i].close ?? 0);
    const c = Number(rows[i].close ?? 0);
    const tr = Math.max(h - l, Math.abs(h - prevClose), Math.abs(l - prevClose));
    atr = ema(atr, tr, k);
    prevClose = c;
  }
  return atr;
}

/* ===== Hedef (target) tahmini ===== */
function estimateTarget(dir, Lpot, ema200, swings) {
  const price = Number(Lpot?.close);
  if (!price) return { target: null, text: "—" };
  let target = null;
  let why = "";
  if (dir === "LONG") {
    if (Lpot?.bbUpper != null) {
      target = Number(Lpot.bbUpper);
      why = "BB üst";
    } else if (ema200 && ema200 > price) {
      target = ema200;
      why = "EMA200";
    } else if (swings?.high) {
      target = swings.high;
      why = "Son tepe";
    }
  } else {
    if (Lpot?.bbLower != null) {
      target = Number(Lpot.bbLower);
      why = "BB alt";
    } else if (ema200 && ema200 < price) {
      target = ema200;
      why = "EMA200";
    } else if (swings?.low) {
      target = swings.low;
      why = "Son dip";
    }
  }
  if (!target) return { target: null, text: "—" };
  const pct = ((target - price) / price) * 100;
  return { target, text: `${pct >= 0 ? "+" : ""}${fmt(pct, 1)}% → ${why}` };
}
function swingHL(series, lookback = 100) {
  if (!series?.length) return null;
  const arr = series.slice(-lookback);
  const high = Math.max(...arr.map((r) => Number(r.high ?? r.close ?? 0)));
  const low = Math.min(...arr.map((r) => Number(r.low ?? r.close ?? 0)));
  return { high, low };
}

/* ===== Sayfa ===== */
export default function PanelSinyal() {
  const router = useRouter();

  /* Access guard */
  const [authOk, setAuthOk] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    let u = null;
    try {
      u = JSON.parse(localStorage.getItem("kgz_user") || "null");
    } catch {}
    if (!u?.role || !ALLOWED_ROLES.has(u.role)) router.replace("/login?next=/panel-sinyal");
    else setAuthOk(true);
  }, [router]);

  /* Sembol listesi (tüm USDT-perp) */
  const [symbols, setSymbols] = useState([]);
  useEffect(() => {
    async function loadSymbols() {
      // 1) Varsa backend’den çek
      try {
        const r = await fetch("/api/futures/symbols?quote=USDT", { cache: "no-store" });
        const j = await r.json();
        const list = (j?.symbols || j || []).filter((s) => typeof s === "string" && s.endsWith("USDT"));
        if (list.length) {
          setSymbols(list);
          return;
        }
      } catch {}
      // 2) Geniş fallback
      setSymbols([
        "BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","LINKUSDT","TRXUSDT","MATICUSDT",
        "DOTUSDT","AVAXUSDT","OPUSDT","ARBUSDT","TONUSDT","ATOMUSDT","APTUSDT","FILUSDT","NEARUSDT","SUIUSDT",
        "AAVEUSDT","INJUSDT","PEPEUSDT","BCHUSDT","LTCUSDT","UNIUSDT","ETCUSDT","ICPUSDT","JUPUSDT","RUNEUSDT",
        "TIAUSDT","SEIUSDT","BLURUSDT","GALAUSDT","SANDUSDT","SHIBUSDT","FTMUSDT","WIFUSDT","RNDRUSDT","WLDUSDT",
      ]);
    }
    if (authOk) loadSymbols();
  }, [authOk]);

  /* WebSocket fiyat (miniTicker) */
  const [wsTicks, setWsTicks] = useState({});
  useEffect(() => {
    if (!authOk || !symbols.length) return;
    const chunks = []; // Binance limitlerini zorlamamak için 100’lük gruplar
    for (let i = 0; i < symbols.length; i += 100) chunks.push(symbols.slice(i, i + 100));
    const sockets = [];
    const timers = [];
    const pend = {};
    const openWS = (syms) => {
      const streams = syms.map((s) => `${s.toLowerCase()}@miniTicker`).join("/");
      const url = `wss://fstream.binance.com/stream?streams=${streams}`;
      const ws = new WebSocket(url);
      ws.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data)?.data;
          if (!d?.s) return;
          const last = d?.c ? +d.c : null;
          const chg = d?.P !== undefined ? +d.P : d?.o && d?.c ? ((+d.c - +d.o) / +d.o) * 100 : null;
          pend[d.s] = { last, chg };
          if (!timers[0]) {
            timers[0] = setTimeout(() => {
              setWsTicks((p) => ({ ...p, ...pend }));
              for (let k in pend) delete pend[k];
              timers[0] = null;
            }, 800);
          }
        } catch {}
      };
      sockets.push(ws);
    };
    chunks.forEach(openWS);
    return () => {
      sockets.forEach((ws) => {
        try {
          ws && ws.close();
        } catch {}
      });
      timers.forEach((t) => clearTimeout(t));
    };
  }, [authOk, symbols]);

  /* UI durumları */
  const [mode, setMode] = useState("intraday");
  const [use3m, setUse3m] = useState(true);
  const [use30m, setUse30m] = useState(true);
  const [use4h, setUse4h] = useState(false);

  const activeIntervals = useMemo(() => {
    const base = mode === "intraday" ? ["5m", "15m", "1h"] : ["1m", "5m"];
    if (use3m && !base.includes("3m")) base.splice(1, 0, "3m");
    if (use30m && !base.includes("30m")) base.push("30m");
    if (use4h && !base.includes("4h")) base.push("4h");
    return base;
  }, [mode, use3m, use30m, use4h]);

  const [potIv, setPotIv] = useState("12h"); // 12h | 1d
  const [minPot, setMinPot] = useState(0.15);
  const [sameDir, setSameDir] = useState(true);
  const [useRegime, setUseRegime] = useState(true);
  const [useSqueeze, setUseSqueeze] = useState(false);
  const [sqThresh, setSqThresh] = useState(0.012);

  const [useWhale, setUseWhale] = useState(true);
  const [useOI, setUseOI] = useState(true);
  const [useFunding, setUseFunding] = useState(true);

  const [capital, setCapital] = useState(0);
  const [riskPct, setRiskPct] = useState(0.5);
  const [atrK, setAtrK] = useState(1.5);
  const [timeStopMin, setTimeStopMin] = useState(60);

  const [easyMode, setEasyMode] = useState(true);
  const [easyApplied, setEasyApplied] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const [onlyFavs, setOnlyFavs] = useState(false);
  const [favs, setFavs] = useState([]);
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const arr = JSON.parse(localStorage.getItem("kgz_favs") || "[]");
        if (Array.isArray(arr)) setFavs(arr);
      } catch {}
    }
  }, []);

  const [refreshMs, setRefreshMs] = useState(10_000);
  const [lastRunAt, setLastRunAt] = useState(null);
  const [stats, setStats] = useState({ scanned: 0, keptStrict: 0, keptEasy: 0, missingBB: 0 });

  /* TARAMA */
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);

  async function scanOnce(params, counters) {
    const { potIvX, minPotX, sameDirX, useRegimeX, useSqueezeX, sqThreshX } = params;
    const list = symbols.filter((s) => !onlyFavs || favs.includes(s));

    const tasks = list.map(async (sym) => {
      counters.scanned++;

      // 1) Topla
      const reqs = [
        getLatest(sym, potIvX),
        ...activeIntervals.map((iv) => getLatest(sym, iv)),
        getLatest(sym, "15m"), // ATR referansı (latest.atr14)
        (useWhale || useOI || useFunding) ? getMetrics(sym) : Promise.resolve({ oiChangePct: 0, fundingRate: 0, whaleNetflowUsd: 0 }),
      ];
      const res = await Promise.all(reqs);
      const Lpot = res[0];
      const frames = {};
      activeIntervals.forEach((iv, i) => (frames[iv] = res[i + 1]));
      const atrRef = res[1 + activeIntervals.length];
      const metrics = res[2 + activeIntervals.length] || { oiChangePct: 0, fundingRate: 0, whaleNetflowUsd: 0 };

      // 2) Yön
      const { dir, conf } = decideDirection(frames);
      if (dir === "NEUTRAL") return null;

      // 3) MTF aynı yön
      if (sameDirX) {
        const signs = activeIntervals
          .map((iv) => {
            const s = momentumScore(frames[iv]);
            return s === 0 ? 0 : s > 0 ? 1 : -1;
          })
          .filter((x) => x !== 0);
        if (signs.length && !signs.every((x) => x === signs[0])) return null;
      }

      // 4) Rejim
      if (useRegimeX) {
        const L15 = frames["15m"],
          L1h = frames["1h"];
        if (dir === "LONG") {
          if (L15 && !(L15.close > L15.ema20)) return null;
          if (L1h && !(L1h.close > L1h.ema20)) return null;
        } else {
          if (L15 && !(L15.close < L15.ema20)) return null;
          if (L1h && !(L1h.close < L1h.ema20)) return null;
        }
      }

      // 5) Sıkışma
      if (useSqueezeX) {
        const w15 = bbWidthPct(frames["15m"]);
        if (w15 == null || !(w15 <= sqThreshX)) return null;
      }

      // 6) POTANSİYEL
      let potSource = "BB";
      let pickPot = null;
      const c = Number(Lpot?.close);
      const upBB = Lpot?.bbUpper != null && c ? (Number(Lpot.bbUpper) - c) / c : null;
      const downBB = Lpot?.bbLower != null && c ? (c - Number(Lpot.bbLower)) / c : null;
      if (upBB == null && downBB == null && Lpot) counters.missingBB++;

      // ATR hazır mı?
      let atr = (atrRef?.atr14 && atrRef?.close) ? Number(atrRef.atr14) : null;

      // ATR yoksa seriden hesapla (15m)
      let seriesForAtr = null;
      if (!atr) {
        seriesForAtr = await getSeries(sym, "15m", 200);
        const atrCalc = computeATR14FromSeries(seriesForAtr);
        if (atrCalc) atr = atrCalc;
      }

      if (dir === "LONG") {
        if (upBB != null) pickPot = upBB;
        else if (atr && c) {
          potSource = "ATR";
          pickPot = Math.max(0, (atr * 2) / c);
        }
      } else {
        if (downBB != null) pickPot = downBB;
        else if (atr && c) {
          potSource = "ATR";
          pickPot = Math.max(0, (atr * 2) / c);
        }
      }
      if (pickPot == null || pickPot < minPotX) return null;

      // 7) Teyit (Whale/OI/Funding)
      let confBoost = 0;
      const notes = [];
      if (useWhale && metrics.whaleNetflowUsd) {
        const nf = metrics.whaleNetflowUsd;
        if (dir === "LONG" && nf > 0) {
          confBoost += 0.1;
          notes.push("Whale Netflow ↑");
        }
        if (dir === "SHORT" && nf < 0) {
          confBoost += 0.1;
          notes.push("Whale Netflow ↓");
        }
      }
      if (useOI && metrics.oiChangePct) {
        const oi = metrics.oiChangePct;
        if (oi > 0) {
          confBoost += 0.1;
          notes.push(`OI ${fmt(oi, 1)}%`);
        }
      }
      if (useFunding && metrics.fundingRate) {
        const f = metrics.fundingRate;
        if (dir === "LONG" && f < 0) {
          confBoost += 0.05;
          notes.push(`Funding ${fmt(f * 100, 3)}%`);
        }
        if (dir === "SHORT" && f > 0) {
          confBoost += 0.05;
          notes.push(`Funding ${fmt(f * 100, 3)}%`);
        }
      }

      const baseConf = conf || 0.4;
      const potNorm = Math.min(1, pickPot / 0.5);
      const score01 = Math.max(0, Math.min(1, 0.55 * baseConf + 0.35 * potNorm + 0.1 * confBoost));
      const score100 = Math.round(score01 * 100);

      const price = wsTicks[sym]?.last ?? frames["15m"]?.close ?? frames["1h"]?.close ?? Lpot?.close;

      // Entry/SL/TP (ATR ile)
      let entry = price,
        sl = null,
        tp1 = null,
        tp2 = null,
        tp3 = null;
      if (entry && atr) {
        const risk = atrK * atr;
        if (dir === "LONG") {
          sl = entry - risk;
          tp1 = entry + risk;
          tp2 = entry + risk * 2;
          tp3 = entry + risk * 3;
        } else {
          sl = entry + risk;
          tp1 = entry - risk;
          tp2 = entry - risk * 2;
          tp3 = entry - risk * 3;
        }
      }

      // Pozisyon büyüklüğü
      let posUSDT = null;
      if (entry && sl && capital > 0 && riskPct > 0) {
        const riskDollar = capital * (riskPct / 100);
        const perUnit = Math.abs(entry - sl);
        if (perUnit > 0) posUSDT = riskDollar / perUnit;
      }

      // EMA200/Swings seriden (hedef için)
      let ema200 = frames["15m"]?.ema200 ?? null;
      let swings = null;
      if ((!ema200 || !seriesForAtr) && (dir || true)) {
        const ser = seriesForAtr || (await getSeries(sym, "15m", 220));
        swings = swingHL(ser, 120);
        // kabaca ema200 yoksa ema200 ~ 200 bar EMA (yaklaşık); elimizde yoksa pas geç
      }

      const { text: targetText } = estimateTarget(dir, Lpot, ema200, swings);

      const potTxt = `${potIvX.toUpperCase()} pot≈${dir === "LONG" ? "+" : "-"}${fmt(pickPot * 100, 0)}%` + (potSource === "ATR" ? " (ATR)" : "");
      const reasons = reasonsText(frames, potTxt, notes);

      return {
        sym,
        dir,
        score: score100,
        potPct: Math.round(pickPot * 100),
        potSource,
        price,
        reasons,
        entry,
        sl,
        tp1,
        tp2,
        tp3,
        posUSDT,
        targetText,
      };
    });

    const res = await Promise.all(tasks);
    return res.filter(Boolean).sort((a, b) => (b.score - a.score) || (b.potPct - a.potPct));
  }

  async function doScan() {
    setLoading(true);
    setEasyApplied(false);
    const counters = { scanned: 0, keptStrict: 0, keptEasy: 0, missingBB: 0 };
    try {
      const strictOut = await scanOnce(
        {
          potIvX: potIv,
          minPotX: minPot,
          sameDirX: sameDir,
          useRegimeX: useRegime,
          useSqueezeX: useSqueeze,
          sqThreshX: sqThresh,
        },
        counters
      );
      counters.keptStrict = strictOut.length;

      if (strictOut.length > 0 || !easyMode) {
        setRows(strictOut);
      } else {
        const easyOut = await scanOnce(
          {
            potIvX: potIv,
            minPotX: Math.min(minPot, 0.1),
            sameDirX: false,
            useRegimeX: useRegime,
            useSqueezeX: false,
            sqThreshX: sqThresh,
          },
          counters
        );
        counters.keptEasy = easyOut.length;
        setRows(easyOut);
        setEasyApplied(true);
      }
    } finally {
      setStats(counters);
      setLastRunAt(new Date());
      setLoading(false);
    }
  }

  /* Otomatik yenile */
  useEffect(() => {
    if (!authOk || !symbols.length) return;
    const t = setInterval(doScan, refreshMs);
    doScan();
    return () => clearInterval(t);
  }, [
    authOk,
    symbols,
    refreshMs,
    mode,
    use3m,
    use30m,
    use4h,
    potIv,
    minPot,
    sameDir,
    useRegime,
    useSqueeze,
    sqThresh,
    easyMode,
    useWhale,
    useOI,
    useFunding,
    atrK,
    capital,
    riskPct,
    onlyFavs,
  ]);

  if (!authOk) return <main style={{ padding: 16 }}><div style={{ opacity: .7 }}>Yetki doğrulanıyor…</div></main>;
  if (!symbols.length) return <main style={{ padding: 16 }}><div style={{ opacity: .7 }}>Semboller yükleniyor…</div></main>;

  return (
    <main style={{ minHeight: "100vh", background: "#0f1320", color: "#e6f0ff", padding: "16px 18px", paddingBottom: 60 }}>
      {/* NAV */}
      <nav style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <button
          onClick={() => (history.length > 1 ? history.back() : router.push("/"))}
          style={{ background: "#1a1f2e", border: "1px solid #2a2f45", color: "#fff", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}
        >
          ← Geri
        </button>
        <Link href="/" style={{ color: "#8bd4ff", fontWeight: 900, fontSize: 18, textDecoration: "none" }}>
          Kripto Gözü
        </Link>
        <Link href="/" style={{ color: "#d0d6e6", textDecoration: "none" }}>Ana Sayfa</Link>
        <Link href="/panel" style={{ color: "#d0d6e6", textDecoration: "none" }}>Panel</Link>
        <Link href="/whales" style={{ color: "#d0d6e6", textDecoration: "none" }}>Balina</Link>
        <Link href="/balina2d" style={{ color: "#d0d6e6", textDecoration: "none" }}>Balina2D</Link>

        <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <label style={lbl}><input type="checkbox" checked={easyMode} onChange={(e) => setEasyMode(e.target.checked)} /> Kolay Mod</label>
          <button onClick={() => setHelpOpen((v) => !v)} style={{ ...btn, padding: "6px 10px" }}>?</button>
          <label style={lbl}>
            Hız
            <select value={String(refreshMs)} onChange={(e) => setRefreshMs(Number(e.target.value))} style={sel}>
              <option value="5000">5s</option>
              <option value="10000">10s</option>
              <option value="20000">20s</option>
            </select>
          </label>
        </span>
      </nav>

      {/* Başlık + canlı + istatistik */}
      <h1 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 10 }}>
        Panel – Sinyal (PRO) <LiveDot />
        {easyApplied && (
          <span style={{ marginLeft: 10, padding: "4px 8px", borderRadius: 8, border: "1px solid #314466", background: "#142235", color: "#9bd0ff", fontSize: 12, fontWeight: 800 }}>
            Kolay Mod devrede
          </span>
        )}
      </h1>

      <div style={{
        display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
        padding: "8px 10px", border: "1px solid #25304a", background: "#121a2e", borderRadius: 8, marginBottom: 12, fontSize: 13
      }}>
        <span>Tarandı: <b>{stats.scanned}</b></span>
        <span>Geçen (strict): <b>{stats.keptStrict}</b></span>
        <span>Geçen (easy): <b>{stats.keptEasy}</b></span>
        <span>Eksik BB: <b style={{ color: stats.missingBB ? "#ffb86b" : "#a9b4c9" }}>{stats.missingBB}</b></span>
        <span style={{ opacity: .75 }}>Son tarama: {lastRunAt ? lastRunAt.toLocaleTimeString() : "—"}</span>
      </div>

      {/* Kontroller */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <label style={lbl}>
          Mod
          <select value={mode} onChange={(e) => setMode(e.target.value)} style={sel}>
            <option value="scalper">Scalper (1m+5m)</option>
            <option value="intraday">Gün-İçi (5m+15m+1h)</option>
          </select>
        </label>
        <label style={lbl}><input type="checkbox" checked={use3m} onChange={(e) => setUse3m(e.target.checked)} /> 3m</label>
        <label style={lbl}><input type="checkbox" checked={use30m} onChange={(e) => setUse30m(e.target.checked)} /> 30m</label>
        <label style={lbl}><input type="checkbox" checked={use4h} onChange={(e) => setUse4h(e.target.checked)} /> 4h</label>

        <label style={lbl}>
          Pot. Çerçeve
          <select value={potIv} onChange={(e) => setPotIv(e.target.value)} style={sel}>
            <option value="12h">12h</option>
            <option value="1d">1D</option>
          </select>
        </label>
        <label style={lbl}>
          Min Potansiyel
          <select value={String(minPot)} onChange={(e) => setMinPot(Number(e.target.value))} style={sel}>
            <option value="0.10">≥ %10</option>
            <option value="0.15">≥ %15</option>
            <option value="0.20">≥ %20</option>
            <option value="0.30">≥ %30</option>
          </select>
        </label>

        <label style={lbl}><input type="checkbox" checked={sameDir} onChange={(e) => setSameDir(e.target.checked)} /> MTF aynı yön</label>
        <label style={lbl}><input type="checkbox" checked={useRegime} onChange={(e) => setUseRegime(e.target.checked)} /> Rejim filtresi</label>
        <label style={lbl}><input type="checkbox" checked={useSqueeze} onChange={(e) => setUseSqueeze(e.target.checked)} /> Sıkışma</label>
        <label style={lbl}>
          BB genişlik
          <select value={String(sqThresh)} onChange={(e) => setSqThresh(Number(e.target.value))} style={sel}>
            <option value="0.008">≤ 0.8%</option>
            <option value="0.012">≤ 1.2%</option>
            <option value="0.018">≤ 1.8%</option>
          </select>
        </label>

        <label style={lbl}><input type="checkbox" checked={useWhale} onChange={(e) => setUseWhale(e.target.checked)} /> Whale</label>
        <label style={lbl}><input type="checkbox" checked={useOI} onChange={(e) => setUseOI(e.target.checked)} /> OI</label>
        <label style={lbl}><input type="checkbox" checked={useFunding} onChange={(e) => setUseFunding(e.target.checked)} /> Funding</label>

        <label style={lbl}>
          Sermaye (USDT)
          <input type="number" value={capital} onChange={(e) => setCapital(Number(e.target.value) || 0)} style={{ ...sel, width: 110 }} placeholder="0" />
        </label>
        <label style={lbl}>
          Risk %
          <input type="number" step="0.1" value={riskPct} onChange={(e) => setRiskPct(Number(e.target.value) || 0)} style={{ ...sel, width: 90 }} placeholder="0.5" />
        </label>
        <label style={lbl}>
          ATR k
          <select value={String(atrK)} onChange={(e) => setAtrK(Number(e.target.value))} style={sel}>
            <option value="1.0">1.0</option>
            <option value="1.25">1.25</option>
            <option value="1.5">1.5</option>
            <option value="2.0">2.0</option>
          </select>
        </label>
        <label style={lbl}>
          Time-Stop
          <select value={String(timeStopMin)} onChange={(e) => setTimeStopMin(Number(e.target.value))} style={sel}>
            <option value="30">30 dk</option>
            <option value="60">60 dk</option>
            <option value="90">90 dk</option>
          </select>
        </label>

        <label style={lbl}><input type="checkbox" checked={onlyFavs} onChange={(e) => setOnlyFavs(e.target.checked)} /> Sadece Favoriler</label>

        <button onClick={doScan} disabled={loading} style={btn}>{loading ? "Taranıyor…" : "Yenile"}</button>
      </div>

      {/* Açıklamalar */}
      {helpOpen && (
        <div style={{ border: "1px solid #25304a", background: "#101a30", borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13, lineHeight: 1.5 }}>
          <b>Kolay Mod</b>: Hiç sinyal çıkmazsa filtreleri otomatik gevşetir (min potansiyeli düşürür, MTF zorunluluğunu kaldırır, sıkışmayı kapatır).<br />
          <b>Pot. Çerçeve</b>: Hedef hesaplamak için kullanılan üst çerçeve (12h/1D).<br />
          <b>Min Potansiyel</b>: Hedefe göre en az beklenen hareket (ör. ≥%15).<br />
          <b>MTF aynı yön</b>: 1m/3m/5m/15m/30m/1h/4h momentumu aynı yönde olmalı.<br />
          <b>Rejim filtresi</b>: 15m ve 1h’de EMA20 tarafı yönle uyumlu olmalı (trend karşısına işlem azaltılır).<br />
          <b>Sıkışma</b>: 15m’de BB genişliği eşikte ve altında olmalı (breakout bekleyen strateji için).<br />
          <b>Whale/OI/Funding</b>: On-chain/derivatif teyitleri; skora küçük ek katkı verir.<br />
          <b>Entry/SL/TP</b>: BB yoksa **ATR(15m)** seriden hesaplanır; ATR*{fmt(atrK,2)} ile SL, 1-2-3R TP yazılır.<br />
          <b>Hedef</b>: LONG→ BB üst ▸ EMA200 ▸ son tepe; SHORT→ BB alt ▸ EMA200 ▸ son dip (yaklaşık).<br />
        </div>
      )}

      {/* Liste (responsive grid) */}
      <div style={{ border: "1px solid #25304a", borderRadius: 12, overflow: "hidden", background: "#0f1320" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(110px,140px) 80px 70px 1fr minmax(260px,320px) minmax(120px,160px) minmax(150px,210px) 90px",
            gap: 8,
            padding: "10px 12px",
            background: "#151b2c",
            color: "#a9b4c9",
            fontWeight: 800,
          }}
        >
          <div>Coin</div>
          <div>Yön</div>
          <div>Skor</div>
          <div>Neden (kısa özet)</div>
          <div>Entry • SL • TP1/2/3</div>
          <div>Önerilen Poz.</div>
          <div>Hedef</div>
          <div>Kaynak</div>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: "12px 14px", opacity: 0.75 }}>Filtreye uyan güçlü sinyal yok (ayarları değiştirip tekrar dene).</div>
        ) : (
          rows.map((s) => {
            const col = s.dir === "LONG" ? "#22d39a" : "#ff6b6b";
            return (
              <div
                key={s.sym}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(110px,140px) 80px 70px 1fr minmax(260px,320px) minmax(120px,160px) minmax(150px,210px) 90px",
                  gap: 8,
                  padding: "10px 12px",
                  borderTop: "1px solid #23283b",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                  <Link href={`/coin/${s.sym}`} style={{ color: "#8bd4ff", fontWeight: 900, textDecoration: "none", whiteSpace: "nowrap" }}>
                    {s.sym}
                  </Link>
                  <span style={{ opacity: 0.7, whiteSpace: "nowrap" }}>@ {fmt(s.price)}</span>
                </div>

                <div style={{ fontWeight: 900, color: col }}>{s.dir}</div>
                <div style={{ fontWeight: 900 }}>{fmt(s.score, 0)}</div>
                <div style={{ opacity: 0.95, overflow: "hidden", textOverflow: "ellipsis" }}>{s.reasons}</div>

                <div style={{ fontSize: 12, lineHeight: 1.35 }}>
                  {s.entry && s.sl && s.tp1 ? (
                    <>
                      <div><b>Entry:</b> {fmt(s.entry, s.entry >= 100 ? 2 : 4)}</div>
                      <div><b>SL:</b> {fmt(s.sl, s.sl >= 100 ? 2 : 4)}</div>
                      <div><b>TP1/2/3:</b> {fmt(s.tp1, s.tp1 >= 100 ? 2 : 4)} • {fmt(s.tp2, s.tp2 >= 100 ? 2 : 4)} • {fmt(s.tp3, s.tp3 >= 100 ? 2 : 4)}</div>
                      <div style={{ opacity: 0.65 }}>ATR(15m)×{fmt(atrK, 2)} • Time-Stop: {timeStopMin} dk</div>
                    </>
                  ) : (
                    <span style={{ opacity: 0.6 }}>ATR verisi yok → Entry/SL/TP hesaplanamadı</span>
                  )}
                </div>

                <div style={{ fontWeight: 800 }}>
                  {s.posUSDT ? `${fmt(s.posUSDT, 2)} USDT` : <span style={{ opacity: 0.6 }}>Sermaye & Risk% gir</span>}
                </div>

                <div style={{ fontSize: 12, opacity: 0.9 }}>{s.targetText}</div>

                <div style={{ fontSize: 12, opacity: 0.8 }}>{s.potSource === "BB" ? "BB" : "ATR"}</div>
              </div>
            );
          })
        )}
      </div>

      <p style={{ opacity: 0.6, marginTop: 10, fontSize: 12 }}>
        Kaynak: Binance Futures (miniTicker WS + MTF indicators + {potIv.toUpperCase()} potansiyel). Bilgi amaçlıdır, yatırım tavsiyesi değildir.
      </p>
    </main>
  );
}

/* ===== UI parçaları ===== */
function LiveDot() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          background: "#22d39a",
          boxShadow: "0 0 0 0 rgba(34,211,154,.7)",
          animation: "pulse 1.5s infinite",
        }}
      />
      <span style={{ opacity: 0.8 }}>Canlı</span>
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
const lbl = { display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px", border: "1px solid #2a2f45", background: "#121625", borderRadius: 8 };
const sel = { padding: "6px 8px", background: "#0f1320", border: "1px solid #23283b", borderRadius: 8, color: "#e6e6e6" };
const btn = { padding: "8px 12px", background: "#1a1f2e", border: "1px solid #2a2f45", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer" };
