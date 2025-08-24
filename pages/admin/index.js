import { useEffect, useRef, useState } from "react";

const INTERVALS = ["1m", "5m", "15m", "1h", "4h"];

function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function pct(n, d = 2) {
  if (n == null || isNaN(n)) return "—";
  const v = Number(n);
  const s = v >= 0 ? "+" : "";
  return s + v.toFixed(d) + "%";
}

export default function Admin() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setInterval] = useState("1m");
  const [latest, setLatest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const [err, setErr] = useState(null);
  const timerRef = useRef(null);

  async function load() {
    try {
      setLoading(true); setErr(null);
      const r = await fetch(`/api/futures/indicators?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=300`, { cache: "no-store" });
      const j = await r.json();
      setLatest(j.latest || null);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [symbol, interval]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (auto) timerRef.current = setInterval(load, 10000); // 10 sn
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [auto, symbol, interval]);

  const close = latest?.close ?? null;
  const ema20 = latest?.ema20 ?? null;
  const rsi14 = latest?.rsi14 ?? null;
  const bbU = latest?.bbUpper ?? null;
  const bbL = latest?.bbLower ?? null;
  const mid = (bbU != null && bbL != null) ? (bbU + bbL) / 2 : null;

  const distEmaPct = (close != null && ema20 != null) ? ((close - ema20) / ema20 * 100) : null;
  const bandPosPct = (bbU != null && bbL != null && close != null) ? ((close - bbL) / (bbU - bbL) * 100) : null; // 0=alt, 100=üst
  const bandWidthPct = (bbU != null && bbL != null && close != null) ? ((bbU - bbL) / close * 100) : null;

  const rsiLabel = (rsi14 == null) ? "—" : (rsi14 >= 70 ? "Aşırı Alım" : rsi14 <= 30 ? "Aşırı Satım" : "Nötr");

  return (
    <main style={{ minHeight: "100vh", background: "#0f1115", color: "#e6e6e6", padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ color: "#59c1ff", marginTop: 0 }}>KriptoGözü • Admin</h1>

      {/* Kontroller */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="BTCUSDT"
          style={{ padding: "10px 12px", background: "#121625", border: "1px solid #23283b", borderRadius: 10, color: "#e6e6e6" }}
        />
        <select
          value={interval}
          onChange={(e) => setInterval(e.target.value)}
          style={{ padding: "10px 12px", background: "#121625", border: "1px solid #23283b", borderRadius: 10, color: "#e6e6e6" }}
        >
          {INTERVALS.map(iv => <option key={iv} value={iv}>{iv}</option>)}
        </select>
        <button
          onClick={load}
          disabled={loading}
          style={{ padding: "10px 14px", background: "#1a1f2e", border: "1px solid #2a2f45", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer" }}
        >
          {loading ? "Yükleniyor..." : "Yenile"}
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          10 sn’de bir otomatik yenile
        </label>
      </div>

      {err && <div style={{ color: "#ffb4b4", marginBottom: 12 }}>Hata: {err}</div>}

      {/* Kartlar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <Card title={`${symbol} (${interval})`} value={fmt(close)} sub="Son Kapanış" />
        <Card title="EMA20" value={fmt(ema20)} sub={`Fiyat/EMA: ${pct(distEmaPct)}`} highlight={distEmaPct != null && Math.abs(distEmaPct) >= 1} />
        <Card title="RSI(14)" value={fmt(rsi14)} sub={rsiLabel} highlight={rsi14 != null && (rsi14 <= 30 || rsi14 >= 70)} />
        <Card title="Bollinger Üst" value={fmt(bbU)} sub={`Bant Genişliği: ${pct(bandWidthPct)}`} />
        <Card title="Bollinger Orta" value={fmt(mid)} sub={`Banttaki Konum: ${pct(bandPosPct)}`} />
        <Card title="Bollinger Alt" value={fmt(bbL)} sub="—" />
      </div>
    </main>
  );
}

function Card({ title, value, sub, highlight }) {
  return (
    <div style={{
      background: "#151a2b",
      border: `1px solid ${highlight ? "#3ea76a" : "#26304a"}`,
      borderRadius: 12,
      padding: 14
    }}>
      <div style={{ opacity: .8, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 12, opacity: .7, marginTop: 6 }}>{sub}</div>
    </div>
  );
}

