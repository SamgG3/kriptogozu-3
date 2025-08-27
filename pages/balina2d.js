// pages/balina2d.js
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

/** === Ayarlar === */
const MIN_USD = 50000; // <<< Eşik: 50.000 USD (istediğinde değiştir)
const MAX_ITEMS = 200; // listede tutulacak maksimum kayıt

/** === Yardımcılar === */
const fmt = (v, d = 0) =>
  v == null || isNaN(v)
    ? "—"
    : Number(v).toLocaleString("tr-TR", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      });

const ts = (t) => {
  try {
    const d = new Date(t);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  } catch {
    return "—";
  }
};

export default function Balina2DPage() {
  const [items, setItems] = useState([]); // canlı akış
  const [status, setStatus] = useState("hazırlanıyor");
  const [subCount, setSubCount] = useState(0);
  const wsRef = useRef(null);

  // sembolleri çek → BTC/ETH hariç USDT pariteleri
  async function getSymbols() {
    try {
      const r = await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo");
      const j = await r.json();
      const list = (j?.symbols || [])
        .filter((s) => s.contractType !== "PERPETUAL" ? true : true) // tüm perpetual’lar kalsın
        .filter((s) => s.status === "TRADING")
        .filter((s) => s.quoteAsset === "USDT")
        .map((s) => s.symbol)
        .filter((s) => s !== "BTCUSDT" && s !== "ETHUSDT");
      return list;
    } catch {
      return [];
    }
  }

  useEffect(() => {
    let ws;
    let alive = true;

    (async () => {
      setStatus("semboller alınıyor…");
      const symbols = await getSymbols();
      if (!alive) return;
      if (!symbols.length) {
        setStatus("sembol yok / ağ hatası");
        return;
      }

      // WebSocket /ws (SUBSCRIBE ile çoklu akış)
      setStatus("bağlanıyor…");
      ws = new WebSocket("wss://fstream.binance.com/ws");
      wsRef.current = ws;

      ws.onopen = () => {
        if (!alive) return;
        // aggTrade akışları
        const params = symbols.map((s) => `${s.toLowerCase()}@aggTrade`);
        const chunkSize = 200; // çok fazla stream varsa parça parça abone ol
        let total = 0;
        for (let i = 0; i < params.length; i += chunkSize) {
          const chunk = params.slice(i, i + chunkSize);
          ws.send(
            JSON.stringify({
              method: "SUBSCRIBE",
              params: chunk,
              id: 1 + i / chunkSize,
            })
          );
          total += chunk.length;
        }
        setSubCount(total);
        setStatus("açık");
      };

      ws.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data);
          // aggTrade olayı
          if (d?.e === "aggTrade") {
            const sym = d.s;
            // güvenlik: BTC/ETH gelirse yine ele
            if (sym === "BTCUSDT" || sym === "ETHUSDT") return;

            const price = +d.p;
            const qty = +d.q;
            if (!isFinite(price) || !isFinite(qty)) return;

            const notional = price * qty; // USDT paritesi → ~USD
            if (notional < MIN_USD) return;

            // yön (m: buyer is market maker) → m=true genelde "satış baskısı" gibi okunur
            const side = d.m ? "SELL" : "BUY";

            const row = {
              t: d.T || d.E || Date.now(),
              s: sym,
              p: price,
              q: qty,
              usd: notional,
              side,
            };

            setItems((prev) => {
              const next = [row, ...prev];
              if (next.length > MAX_ITEMS) next.length = MAX_ITEMS;
              return next;
            });
          }
        } catch {}
      };

      ws.onerror = () => {
        if (!alive) return;
        setStatus("hata");
      };
      ws.onclose = () => {
        if (!alive) return;
        setStatus("kapalı");
      };
    })();

    return () => {
      alive = false;
      try {
        const w = wsRef.current;
        if (w && w.readyState === 1) {
          w.close();
        }
      } catch {}
    };
  }, []);

  return (
    <main style={{ padding: 16 }}>
      {/* NAV */}
      <nav
        style={{
          display: "flex",
          gap: 16,
          alignItems: "center",
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <Link href="/" style={{ color: "#8bd4ff", fontWeight: 800 }}>
          Ana Sayfa
        </Link>
        <Link href="/panel" style={{ color: "#d0d6e6" }}>
          Panel
        </Link>
        <Link href="/whales" style={{ color: "#d0d6e6" }}>
          Balina
        </Link>
        <Link href="/balina2d" style={{ color: "#fff", fontWeight: 700 }}>
          Balina2D
        </Link>

        <span style={{ marginLeft: "auto", opacity: 0.8 }}>
          WS: <b>{status}</b> • Abone stream: <b>{subCount}</b> • Eşik:{" "}
          <b>{fmt(MIN_USD)}</b> $
        </span>
      </nav>

      {/* Tablo Başlığı */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.1fr 1.1fr 1fr 0.8fr",
          gap: 0,
          padding: "10px 12px",
          background: "#0e1424",
          color: "#a9b4c9",
          fontWeight: 700,
          border: "1px solid #23283b",
          borderRadius: "10px 10px 0 0",
        }}
      >
        <div>Zaman</div>
        <div>Sembol</div>
        <div>Notional (USD)</div>
        <div>Fiyat</div>
        <div>Yön</div>
      </div>

      {/* Liste */}
      <div
        style={{
          border: "1px solid #23283b",
          borderTop: "none",
          borderRadius: "0 0 10px 10px",
          overflow: "hidden",
        }}
      >
        {items.length === 0 ? (
          <div style={{ padding: 14, opacity: 0.7 }}>Henüz kayıt yok…</div>
        ) : (
          items.map((it, idx) => {
            const col = it.side === "BUY" ? "#22d39a" : "#ff6b6b";
            return (
              <div
                key={idx}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1.1fr 1.1fr 1fr 0.8fr",
                  gap: 0,
                  padding: "10px 12px",
                  borderTop: "1px solid #23283b",
                  alignItems: "center",
                  background: idx % 2 ? "#121625" : "#101522",
                }}
              >
                <div>{ts(it.t)}</div>
                <div style={{ fontWeight: 800, color: "#8bd4ff" }}>{it.s}</div>
                <div style={{ fontWeight: 800 }}>{fmt(it.usd)}</div>
                <div>{fmt(it.p, 6)}</div>
                <div style={{ fontWeight: 800, color: col }}>{it.side}</div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ opacity: 0.6, marginTop: 10, fontSize: 12 }}>
        Akış: Binance Futures <code>aggTrade</code> • BTC/ETH hariç USDT pariteleri • Eşik:{" "}
        <b>{fmt(MIN_USD)}</b> $
      </div>
    </main>
  );
}
