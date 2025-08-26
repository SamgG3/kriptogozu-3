// pages/index.js
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

// Sadece başlangıçta gösterilecek 3'lü
const CORE = ["BTCUSDT", "ETHUSDT", "BNBUSDT"];

// ---- küçük yardımcılar
const fmtPrice = (v) => {
  if (v == null || isNaN(v)) return "—";
  const a = Math.abs(v);
  const d = a >= 100 ? 2 : a >= 1 ? 4 : 6;
  return Number(v).toLocaleString("tr-TR", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
};
const fmt = (v, d = 2) =>
  v == null || isNaN(v)
    ? "—"
    : Number(v).toLocaleString("tr-TR", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      });
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));

// Basit bir “özet sinyal” hesabı (EMA/RSI/Stoch/Bollinger harmanı)
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

// “Risk” için kolay bir katsayı (görsel amaçlı)
function riskX(longPct, shortPct) {
  const dom = Math.max(longPct, shortPct); // 50..100
  const k = 0.032; // görsel ayar
  return (1 + (dom - 50) * k).toFixed(2) + "x";
}

// ---- ANA BİLEŞEN
export default function Home() {
  // ekranda gösterilecek semboller (başlangıç: 3’lü)
  const [symbols, setSymbols] = useState(CORE);
  // teknik indikatör intervali
  const [interval, setIntervalStr] = useState("1m");
  // teknik indikatör verileri
  const [rows, setRows] = useState({});
  const [loading, setLoading] = useState(false);

  // websocket canlı fiyatlar/24s değişim
  const [ticks, setTicks] = useState({});
  const [wsUp, setWsUp] = useState(false);
  const wsRef = useRef(null);

  // arama
  const [q, setQ] = useState("");

  // otomatik yenile (indikatörleri 9 sn)
  const [auto, setAuto] = useState(true);
  const timer = useRef(null);

  // ---- teknik indikatörleri çek
  async function load() {
    try {
      setLoading(true);
      const res = await Promise.all(
        symbols.map((sym) =>
          fetch(
            `/api/futures/indicators?symbol=${sym}&interval=${interval}&limit=300`,
            { cache: "no-store" }
          )
            .then((r) => r.json())
            .catch(() => null)
        )
      );
      const map = {};
      symbols.forEach((sym, i) => (map[sym] = res[i]));
      setRows(map);
    } finally {
      setLoading(false);
    }
  }

  // ilk yük ve interval/symbols değişince
  useEffect(() => {
    load();
  }, [interval, symbols]);

  // otomatik 9 sn’de bir yenile
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (auto) timer.current = setInterval(load, 9000);
    return () => clearInterval(timer.current);
  }, [auto, interval, symbols]);

  // ---- Binance Futures miniTicker WS (yalnızca listelenen semboller)
  const wsStreams = useMemo(() => {
    if (!symbols?.length) return "";
    return symbols.map((s) => `${s.toLowerCase()}@miniTicker`).join("/");
  }, [symbols]);

  useEffect(() => {
    try {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }
      if (!wsStreams) return;

      const url = `wss://fstream.binance.com/stream?streams=${wsStreams}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setWsUp(true);
      ws.onclose = () => setWsUp(false);
      ws.onerror = () => setWsUp(false);

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          const d = msg?.data;
          if (!d) return;
          if (d.e === "24hrMiniTicker") {
            setTicks((prev) => ({
              ...prev,
              [String(d.s).toUpperCase()]: {
                last: Number(d.c),
                chg: Number(d.P), // 24h %
              },
            }));
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
  }, [wsStreams]);

  // ---- ARAMA: yalnızca yazılan sembol gösterilsin (CORE hariç)
  function onSearch() {
    if (!q.trim()) return;
    const raw = q.trim().toUpperCase();
    const sym = raw.endsWith("USDT") ? raw : raw + "USDT";
    setSymbols([sym]); // sadece aranan
  }
  function onReset() {
    setQ("");
    setSymbols(CORE); // 3’lüye dön
  }

  return (
    <main style={{ padding: "16px 18px" }}>
      {/* Başlık + kontroller */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20 }}>
          KriptoGözü • Genel Panel{" "}
          <span style={{ opacity: 0.6, fontSize: 12 }}>
            (kartlarda AI özet • yatırım tavsiyesi DEĞİL)
          </span>
        </h1>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder="Sembol yaz (örn. BTC ya da BTCUSDT)"
          style={{
            padding: "8px 12px",
            background: "#121625",
            border: "1px solid #23283b",
            borderRadius: 10,
            color: "#e6e6e6",
            minWidth: 260,
            marginLeft: 8,
          }}
        />
        <button
          onClick={onSearch}
          style={{
            padding: "8px 12px",
            background: "#1e417c",
            border: "1px solid #2e559f",
            borderRadius: 10,
            color: "#fff",
            fontWeight: 800,
          }}
        >
          Ara
        </button>
        <button
          onClick={onReset}
          style={{
            padding: "8px 12px",
            background: "#2a2f45",
            border: "1px solid #2e3552",
            borderRadius: 10,
            color: "#fff",
            fontWeight: 800,
          }}
        >
          Sıfırla
        </button>

        <select
          value={interval}
          onChange={(e) => setIntervalStr(e.target.value)}
          style={{
            padding: "8px 10px",
            background: "#121625",
            border: "1px solid #23283b",
            borderRadius: 10,
            color: "#e6e6e6",
            marginLeft: 8,
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
            padding: "8px 12px",
            background: "#1a1f2e",
            border: "1px solid #2a2f45",
            borderRadius: 10,
            color: "#fff",
            fontWeight: 800,
          }}
        >
          {loading ? "Yükleniyor…" : "Yenile"}
        </button>

        <label style={{ marginLeft: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
          />
          9 sn’de bir otomatik yenile
        </label>
      </div>

      {/* CANLI TABLO (WebSocket) */}
      <div
        style={{
          border: "1px solid #2a2f45",
          borderRadius: 12,
          overflow: "hidden",
          background: "#111629",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto",
            padding: "10px 12px",
            background: "#121a33",
            color: "#cfe2ff",
            fontWeight: 800,
          }}
        >
          <div>• WebSocket: {wsUp ? "Canlı" : "—"}</div>
          <div style={{ textAlign: "right" }}>Fiyat</div>
          <div style={{ textAlign: "right" }}>Long/Short</div>
          <div style={{ textAlign: "right" }}>24s Değişim</div>
          <div style={{ textAlign: "right" }}>Risk</div>
          <div style={{ textAlign: "center" }}>★</div>
        </div>

        {symbols.map((sym) => {
          const L = rows?.[sym]?.latest || {};
          const { longPct, shortPct } = biasFromLatest(L);
          const t = ticks[sym] || {};
          const chg = t.chg; // 24h %
          const risk = riskX(longPct, shortPct);

          return (
            <div
              key={sym}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto",
                padding: "10px 12px",
                borderTop: "1px solid #161c31",
                alignItems: "center",
              }}
            >
              <div style={{ fontWeight: 800, color: "#9bd0ff" }}>{sym}</div>
              <div style={{ textAlign: "right" }}>{fmtPrice(t.last ?? L.close)}</div>

              <div style={{ textAlign: "right" }}>
                <span style={{ color: "#22d39a", fontWeight: 800 }}>
                  Long {fmt(longPct, 0)}%
                </span>
                <span style={{ opacity: 0.65 }}> / </span>
                <span style={{ color: "#ff6b6b", fontWeight: 800 }}>
                  Short {fmt(shortPct, 0)}%
                </span>
              </div>

              <div
                style={{
                  textAlign: "right",
                  color: chg == null ? "#d0d6e6" : chg >= 0 ? "#22d39a" : "#ff6b6b",
                  fontWeight: 800,
                }}
              >
                {chg == null ? "—" : (chg >= 0 ? "+" : "") + fmt(chg, 2) + "%"}
              </div>

              <div style={{ textAlign: "right", opacity: 0.9, fontWeight: 800 }}>
                {risk}
              </div>

              <div style={{ textAlign: "center", opacity: 0.6 }}>★</div>
            </div>
          );
        })}
      </div>

      {/* Hızlı kartlar (detaya link) — sadece listelenenler */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 12,
        }}
      >
        {symbols.map((sym) => (
          <CoinCard key={sym} sym={sym} row={rows[sym]} />
        ))}
      </div>
    </main>
  );
}

// ---- Kart
function CoinCard({ sym, row }) {
  const L = row?.latest || {};
  const close = L.close;

  const { longPct, shortPct } = biasFromLatest(L);
  const signal = longPct >= 55 ? "AL" : shortPct >= 55 ? "SAT" : "NÖTR";
  const color = signal === "AL" ? "#20c997" : signal === "SAT" ? "#ff6b6b" : "#89a";
  const border = signal === "AL" ? "#1f7a4f" : signal === "SAT" ? "#7a2e2e" : "#2a2f45";

  return (
    <Link href={`/coin/${sym}`} style={{ textDecoration: "none" }}>
      <div
        style={{
          background: "#151a2b",
          border: `1px solid ${border}`,
          borderRadius: 12,
          padding: 14,
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          gap: 10,
          minHeight: 86,
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#8bd4ff" }}>{sym}</div>
          <div style={{ opacity: 0.85 }}>
            Son Fiyat: <b>{fmtPrice(close)}</b>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 800, color }}>{signal}</div>
          <div style={{ opacity: 0.9, marginTop: 4 }}>
            <span style={{ color: "#20c997", fontWeight: 700 }}>
              Long {fmt(longPct, 0)}%
            </span>
            <span style={{ opacity: 0.7 }}> / </span>
            <span style={{ color: "#ff6b6b", fontWeight: 700 }}>
              Short {fmt(shortPct, 0)}%
            </span>
          </div>
          <div style={{ opacity: 0.6, fontSize: 12, marginTop: 6 }}>Tıkla → detay</div>
        </div>
      </div>
    </Link>
  );
}
