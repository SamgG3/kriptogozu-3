// components/WhaleTape.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * WhaleTape: Binance Futures balina akışı
 * - Likidasyonlar: !forceOrder (tüm semboller)
 * - Büyük işlemler: {symbols}@aggTrade (eşik üstü)
 * Not: Sunucusuz barındırmada WS client'ta tutulur.
 */

const WS = "wss://fstream.binance.com/stream";

function fmtNum(n, d = 2) {
  return Number(n).toLocaleString("tr-TR", { maximumFractionDigits: d });
}

export default function WhaleTape({
  symbols = ["BTCUSDT", "ETHUSDT"],
  bigTradeUsd = 200000,     // büyük işlem eşiği ($)
  maxItems = 50,            // listede tutulacak maksimum olay
}) {
  const [items, setItems] = useState([]);
  const wsRef = useRef(null);

  const aggStreams = useMemo(() => {
    // Çok sembol varsa akışı hafif tutmak için ilk 10'u al
    const pick = symbols.slice(0, 10).map(s => `${s.toLowerCase()}@aggTrade`);
    return pick.join("/");
  }, [symbols]);

  const url = useMemo(() => {
    // likidasyon + seçilen aggTrade stream'leri
    const streams = ["!forceOrder", aggStreams].filter(Boolean).join("/");
    return `${WS}?streams=${streams}`;
  }, [aggStreams]);

  useEffect(() => {
    let alive = true;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      if (!alive) return;
      try {
        const pkt = JSON.parse(ev.data);
        const d = pkt?.data;

        // Likidasyon (forceOrder)
        if (d && d.o && d.e === "forceOrder") {
          const o = d.o;
          const sym = String(o.s || "").toUpperCase();
          const side = o.S === "BUY" ? "Long Lik." : "Short Lik.";
          const price = Number(o.ap);
          const qty = Number(o.q);
          const usd = price * qty;

          add({
            type: "liquidation",
            sym, side, price, qty, usd,
            ts: Date.now(),
          });
          return;
        }

        // Büyük işlem (aggTrade)
        if (d && d.e === "aggTrade") {
          const sym = String(d.s || "").toUpperCase();
          const price = Number(d.p);
          const qty = Number(d.q);
          const usd = price * qty;
          if (usd >= bigTradeUsd) {
            // maker mi? (M=true: alıcı pasif → satış baskısı)
            const side = d.m ? "SATIŞ (maker)" : "ALIŞ (taker)";
            add({
              type: "bigtrade",
              sym, side, price, qty, usd,
              ts: Number(d.T) || Date.now(),
            });
          }
        }
      } catch {}
    };

    ws.onerror = () => {};
    ws.onclose = () => {};

    function add(item) {
      setItems((prev) => {
        const next = [item, ...prev].slice(0, maxItems);
        return next;
      });
    }

    return () => {
      alive = false;
      try { ws.close(); } catch {}
    };
  }, [url, bigTradeUsd, maxItems]);

  return (
    <div style={{border:"1px solid #25304a", borderRadius:12, overflow:"hidden", background:"#0f1320"}}>
      <div style={{padding:"10px 12px", background:"#151b2c", color:"#dbe4ff", fontWeight:800}}>
        Balina Akışı <span style={{opacity:.7, fontWeight:600}}>• Likidasyon + Büyük İşlem (≥ {fmtNum(bigTradeUsd,0)}$)</span>
      </div>

      <div style={{maxHeight: 360, overflowY:"auto"}}>
        {items.length===0 && (
          <div style={{padding:12, opacity:.7}}>Henüz kayıt yok…</div>
        )}

        {items.map((it, i) => (
          <div key={i} style={{
            display:"grid",
            gridTemplateColumns:"1fr 1.2fr 1fr 1fr 1fr",
            padding:"10px 12px",
            borderTop:"1px solid #141a2a",
            background: it.type==="liquidation" ? "rgba(255,107,107,0.06)" : "rgba(34,211,154,0.05)"
          }}>
            <div style={{fontWeight:800, color:"#9bd0ff"}}>{it.sym}</div>
            <div style={{fontWeight:800, color: it.type==="liquidation" ? "#ff6b6b" : "#22d39a"}}>{it.side}</div>
            <div style={{textAlign:"right"}}>Fiyat: <b>{fmtNum(it.price, 6)}</b></div>
            <div style={{textAlign:"right"}}>Adet: <b>{fmtNum(it.qty, 4)}</b></div>
            <div style={{textAlign:"right"}}>Tutar: <b>{fmtNum(it.usd, 0)}$</b></div>
          </div>
        ))}
      </div>
    </div>
  );
}
