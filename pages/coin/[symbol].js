// pages/coin/[symbol].js
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

const fmt = (v, d = 2) =>
  v == null || isNaN(v)
    ? "—"
    : Number(v).toLocaleString("tr-TR", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      });

const fmtPrice = (v) => {
  if (v == null || isNaN(v)) return "—";
  const a = Math.abs(v);
  const d = a >= 100 ? 2 : a >= 1 ? 4 : 6;
  return Number(v).toLocaleString("tr-TR", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
};

const clamp = (x, min, max) => Math.max(min, Math.min(max, x));

function biasFromLatest(L) {
  if (!L) return { longPct: 50, shortPct: 50, score: 0 };
  const close = L.close,
    ema = L.ema20,
    rsi = L.rsi14,
    k = L.stochK,
    d = L.stochD,
    bu = L.bbUpper,
    bl = L.bbLower;
  const emaDist = close != null && ema != null ? ((close - ema) / ema) * 100 : null;
  const kCross = k != null && d != null ? k - d : null;
  const bandPos =
    bu != null && bl != null && close != null ? ((close - bl) / (bu - bl)) * 100 : null;
  const nEMA = emaDist == null ? 0 : clamp(emaDist / 3, -1, 1);
  const nRSI = rsi == null ? 0 : clamp((rsi - 50) / 25, -1, 1);
  const nKxD = kCross == null ? 0 : clamp(kCross / 50, -1, 1);
  const nBand = bandPos == null ? 0 : clamp((bandPos - 50) / 30, -1, 1);
  const wEMA = 0.35,
    wRSI = 0.3,
    wKxD = 0.2,
    wBand = 0.15;
  const score = wEMA * nEMA + wRSI * nRSI + wKxD * nKxD + wBand * nBand;
  const longPct = Math.round(((score + 1) / 2) * 100);
  const shortPct = 100 - longPct;
  return { longPct, shortPct, score };
}

/** swing high/low tespiti (pencere=3) */
function swings(series = [], look = 3) {
  const highs = [];
  const lows = [];
  for (let i = look; i < series.length - look; i++) {
    const window = series.slice(i - look, i + look + 1);
    const hi = Math.max(...window);
    const lo = Math.min(...window);
    if (series[i] === hi) highs.push({ i, v: hi });
    if (series[i] === lo) lows.push({ i, v: lo });
  }
  return { highs, lows };
}

/** basit destek/direnç: son 300 bar içinden en yakın 3 seviye */
function supportResistance(closes = [], highs = [], lows = [], price) {
  const up = highs
    .map((h) => h.v)
    .filter((v) => v > price)
    .sort((a, b) => a - b)
    .slice(0, 3);
  const dn = lows
    .map((l) => l.v)
    .filter((v) => v < price)
    .sort((a, b) => b - a)
    .slice(0, 3);
  return { resistances: up, supports: dn };
}

/** EMA20 eğimi ve close>EMA geçişi ile “kırılım” işareti */
function trendBreak(latest, prev) {
  if (!latest || !prev) return { text: "—", color: "#9aa4b2" };
  const c = latest.close,
    e = latest.ema20,
    pC = prev.close,
    pE = prev.ema20;
  if (c == null || e == null || pC == null || pE == null)
    return { text: "—", color: "#9aa4b2" };
  const slope = e - pE; // EMA eğimi
  if (c > e && pC <= pE && slope >= 0)
    return { text: "Yukarı yönlü kırılım", color: "#22d39a" };
  if (c < e && pC >= pE && slope <= 0)
    return { text: "Aşağı yönlü kırılım", color: "#ff6b6b" };
  return { text: "Net kırılım yok", color: "#9aa4b2" };
}

export default function CoinDetail() {
  const router = useRouter();
  const symbolParam = router.query.symbol;
  const symbol = useMemo(() => {
    if (!symbolParam) return null;
    const raw = String(symbolParam).toUpperCase();
    return raw.endsWith("USDT") ? raw : `${raw}USDT`;
  }, [symbolParam]);

  const [interval, setIntervalStr] = useState("1m");
  const [data, setData] = useState(null); // api indicators
  const [loading, setLoading] = useState(false);

  // canlı fiyat
  const [tick, setTick] = useState({ last: null, chg: null });
  const [wsUp, setWsUp] = useState(false);
  const wsRef = useRef(null);

  // 3 sn’de bir veri çek
  const timer = useRef(null);

  async function load() {
    if (!symbol) return;
    try {
      setLoading(true);
      const res = await fetch(
        `/api/futures/indicators?symbol=${symbol}&interval=${interval}&limit=300`,
        { cache: "no-store" }
      ).then((r) => r.json());
      setData(res);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [symbol, interval]);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(load, 3000); // 3 sn
    return () => clearInterval(timer.current);
  }, [symbol, interval]);

  // WS miniTicker
  useEffect(() => {
    if (!symbol) return;
    try {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }
      const stream = `${symbol.toLowerCase()}@miniTicker`;
      const url = `wss://fstream.binance.com/stream?streams=${stream}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setWsUp(true);
      ws.onclose = () => setWsUp(false);
      ws.onerror = () => setWsUp(false);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          const d = msg?.data;
          if (d?.e === "24hrMiniTicker") {
            setTick({ last: Number(d.c), chg: Number(d.P) });
          }
        } catch {}
      };
      return () => {
        try {
          ws.close();
        } catch {}
      };
    } catch {
      setWsUp(false);
    }
  }, [symbol]);

  const latest = data?.latest;
  const prev = data?.prev;
  const close = tick.last ?? latest?.close ?? null;

  const { highs, lows } = useMemo(() => {
    const closes = data?.closes || [];
    return swings(closes, 3);
  }, [data?.closes]);

  const sr = useMemo(() => {
    const closes = data?.closes || [];
    return supportResistance(closes, highs, lows, close ?? 0);
  }, [data?.closes, highs, lows, close]);

  const { longPct, shortPct } = biasFromLatest(latest || {});
  const brk = trendBreak(latest, prev);

  // TP/SL (basit kural: long için en yakın dirençler TP, en yakın destek SL; short için tersi)
  const longTP = [sr.resistances[0], sr.resistances[1], sr.resistances[2]];
  const shortTP = [sr.supports[0], sr.supports[1], sr.supports[2]];
  const longSL = sr.supports[0];
  const shortSL = sr.resistances[0];

  return (
    <main style={{ padding: "14px 16px", fontSize: 14, lineHeight: 1.35 }}>
      <div style={{ marginBottom: 10, display: "flex", gap: 8, alignItems: "center" }}>
        <Link href="/" style={{ color: "#9bd0ff", textDecoration: "none" }}>
          ← Ana Sayfa
        </Link>
        <span style={{ opacity: 0.6 }}>•</span>
        <span style={{ opacity: 0.8 }}>Sembol:</span>
        <b style={{ color: "#9bd0ff", fontSize: 18 }}>{symbol || "—"}</b>
        <span style={{ marginLeft: 10, opacity: 0.8 }}>
          Fiyat: <b>{fmtPrice(close)}</b>
        </span>
        <span
          style={{
            marginLeft: 8,
            color: tick.chg == null ? "#d0d6e6" : tick.chg >= 0 ? "#22d39a" : "#ff6b6b",
            fontWeight: 800,
          }}
        >
          {tick.chg == null ? "" : (tick.chg >= 0 ? "+" : "") + fmt(tick.chg, 2) + "%"}
        </span>
        <span style={{ marginLeft: 8, opacity: 0.6 }}>
          WS: {wsUp ? "Canlı" : "—"}
        </span>

        <span style={{ marginLeft: "auto" }}>
          <select
            value={interval}
            onChange={(e) => setIntervalStr(e.target.value)}
            style={{
              padding: "6px 8px",
              background: "#121625",
              border: "1px solid #23283b",
              borderRadius: 8,
              color: "#e6e6e6",
            }}
          >
            {["1m", "5m", "15m", "1h", "4h"].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
          <button
            onClick={load}
            disabled={loading}
            style={{
              marginLeft: 8,
              padding: "6px 10px",
              background: "#1a1f2e",
              border: "1px solid #2a2f45",
              borderRadius: 8,
              color: "#fff",
              fontWeight: 700,
            }}
          >
            {loading ? "Yükleniyor…" : "Yenile"}
          </button>
        </span>
      </div>

      {/* Özet kutuları */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <Box title="Durum">
          <div>
            Long{" "}
            <b style={{ color: "#22d39a" }}>{fmt(longPct, 0)}
              %</b>{" "}
            / Short <b style={{ color: "#ff6b6b" }}>{fmt(shortPct, 0)}%</b>
          </div>
          <div style={{ marginTop: 4 }}>
            Trend:{" "}
            <b style={{ color: brk.color }}>{brk.text}</b>
          </div>
        </Box>

        <Box title="Destek / Direnç">
          <div>Destek: {sr.supports?.length ? sr.supports.map((v) => fmtPrice(v)).join(" • ") : "—"}</div>
          <div style={{ marginTop: 4 }}>
            Direnç: {sr.resistances?.length ? sr.resistances.map((v) => fmtPrice(v)).join(" • ") : "—"}
          </div>
        </Box>

        <Box title="Long TP/SL">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>TP1: {fmtPrice(longTP[0])}</li>
            <li>TP2: {fmtPrice(longTP[1])}</li>
            <li>TP3: {fmtPrice(longTP[2])}</li>
            <li>SL: {fmtPrice(longSL)}</li>
          </ul>
        </Box>

        <Box title="Short TP/SL">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>TP1: {fmtPrice(shortTP[0])}</li>
            <li>TP2: {fmtPrice(shortTP[1])}</li>
            <li>TP3: {fmtPrice(shortTP[2])}</li>
            <li>SL: {fmtPrice(shortSL)}</li>
          </ul>
        </Box>
      </div>

      <div style={{ opacity: 0.7, fontSize: 12, marginTop: 8 }}>
        Otomatik S/R & trend hesaplaması kullanılır — yanılma payı vardır. Bu bilgiler
        yatırım tavsiyesi değildir.
      </div>
    </main>
  );
}

function Box({ title, children }) {
  return (
    <div
      style={{
        background: "#121a33",
        border: "1px solid #202945",
        borderRadius: 10,
        padding: 12,
        color: "#e6edf6",
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 6, color: "#9bd0ff" }}>{title}</div>
      {children}
    </div>
  );
}
