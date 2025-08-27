// components/Balina2D.jsx
import { useEffect, useRef, useState } from "react";

/**
 * Binance Futures "forceOrder" (likidasyon) yayınını dinler.
 * 50.000$+ notional filtreler, BTC/ETH hariç "diğer coinler" için canlı akış.
 * NOT: Bu, hızlı ve sağlam bir “drop-in” bileşendir. Mevcut sayfana import ederek kullan.
 */

const MIN_USD = 50000; // <<< Eşik burada. 200k'dan 50k'ya çekildi.
const EXCLUDE = new Set(["BTCUSDT", "ETHUSDT"]);
const MAX_ROWS = 200;

function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export default function Balina2D() {
  const [rows, setRows] = useState([]);
  const wsRef = useRef(null);

  useEffect(() => {
    const url = `wss://fstream.binance.com/stream?streams=!forceOrder@arr`;
    let ws;
    try {
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data);
          const data = Array.isArray(payload?.data) ? payload.data : [payload?.data].filter(Boolean);

          const next = [];
          for (const d of data) {
            const o = d?.o;
            if (!o) continue;
            const sym = o.s;         // symbol
            if (!sym || EXCLUDE.has(sym)) continue;

            // price * qty (ap var ise kullanılabilir; yoksa p)
            const price = +o.ap || +o.p || 0;
            const qty   = +o.q || 0;
            const usd   = price * qty;
            if (!isFinite(usd) || usd < MIN_USD) continue;

            const side = o.S;        // BUY / SELL (likide olan taraf)
            const ts   = Date.now();

            next.push({
              ts,
              sym,
              side,
              price,
              qty,
              usd
            });
          }

          if (next.length) {
            setRows((prev) => {
              const merged = [...next, ...prev];
              if (merged.length > MAX_ROWS) merged.length = MAX_ROWS;
              return merged;
            });
          }
        } catch {}
      };
    } catch {}

    return () => {
      try { wsRef.current && wsRef.current.close(); } catch {}
    };
  }, []);

  return (
    <div style={{ padding: 12 }}>
      <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <b style={{ color: "#8bd4ff", fontSize: 18 }}>Balina2D • Diğer Coinler (≥ {fmt(MIN_USD, 0)}$)</b>
        <span style={{ opacity: .65 }}>(BTC/ETH hariç, likidasyon akışı)</span>
      </div>

      <div style={{
        border: "1px solid #23283b",
        borderRadius: 10,
        overflow: "hidden",
        background: "#121625"
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "140px 110px 1fr 1fr 1fr",
          padding: "10px 12px",
          background: "#0e1424",
          color: "#a9b4c9",
          fontWeight: 700
        }}>
          <div>Zaman</div>
          <div>Symbol</div>
          <div>Yön</div>
          <div>Notional (USD)</div>
          <div>Fiyat × Miktar</div>
        </div>

        <div style={{ maxHeight: 520, overflowY: "auto" }}>
          {rows.map((r) => {
            const col = r.side === "BUY" ? "#22d39a" : "#ff6b6b";
            const time = new Date(r.ts).toLocaleTimeString("tr-TR", { hour12: false });
            return (
              <div key={r.ts + r.sym + r.usd}
                   style={{
                     display: "grid",
                     gridTemplateColumns: "140px 110px 1fr 1fr 1fr",
                     padding: "8px 12px",
                     borderTop: "1px solid #23283b",
                     alignItems: "center"
                   }}>
                <div style={{ opacity: .85 }}>{time}</div>
                <div style={{ fontWeight: 800, color: "#8bd4ff" }}>{r.sym}</div>
                <div style={{ fontWeight: 800, color: col }}>{r.side}</div>
                <div style={{ fontWeight: 800 }}>{fmt(r.usd, 0)}</div>
                <div style={{ opacity: .85 }}>{fmt(r.price)} × {fmt(r.qty, 4)}</div>
              </div>
            );
          })}
          {!rows.length && (
            <div style={{ padding: 12, opacity: .7 }}>Henüz ≥ {fmt(MIN_USD,0)}$ işlem düşmedi…</div>
          )}
        </div>
      </div>
    </div>
  );
}
