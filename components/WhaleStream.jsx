// components/WhaleStream.jsx
"use client";
import React, { useEffect, useMemo, useState } from "react";

const WS = "wss://fstream.binance.com/stream";

/**
 * Tek listede balina akışı (likidasyon + büyük işlem).
 * - symbols: izlenecek USDT perpetual sembolleri (örn. ["BTCUSDT","ETHUSDT"])
 * - minUsd: eşik (varsayılan 200k)
 * - maxKeep: listede tutulacak maksimum kayıt
 */
export default function WhaleStream({
  symbols = ["BTCUSDT"],
  minUsd = 200_000,
  maxKeep = 200,
}) {
  const [rows, setRows] = useState([]);

  // aggTrade streamlerini sembollere göre birleştir
  const aggStreams = useMemo(
    () => symbols.slice(0, 50).map(s => `${s.toLowerCase()}@aggTrade`).join("/"),
    [symbols]
  );

  // !forceOrder (likidasyon) + aggTrade (büyük işlem) birlikte
  const url = useMemo(
    () => `${WS}?streams=${["!forceOrder", aggStreams].filter(Boolean).join("/")}`,
    [aggStreams]
  );

  useEffect(() => {
    let alive = true;
    const ws = new WebSocket(url);

    ws.onmessage = (ev) => {
      if (!alive) return;
      try {
        const msg = JSON.parse(ev.data);
        const d = msg?.data;
        let sym, side, usd, kind;

        // Likidasyonlar
        if (d && d.e === "forceOrder" && d.o) {
          const o = d.o;
          sym  = String(o.s || "").toUpperCase();
          if (!symbols.includes(sym)) return; // sadece seçilenler
          side = o.S === "BUY" ? "Long Lik." : "Short Lik.";
          usd  = Number(o.ap) * Number(o.q);
          kind = "liq";
          if (usd >= minUsd) push({ ts: Date.now(), sym, side, usd, kind });
          return;
        }

        // Büyük işlemler (aggTrade)
        if (d && d.e === "aggTrade") {
          sym  = String(d.s || "").toUpperCase();
          if (!symbols.includes(sym)) return; // sadece seçilenler
          const price = Number(d.p);
          const qty   = Number(d.q);
          usd  = price * qty;
          side = d.m ? "Satış" : "Alış";
          kind = "big";
          if (usd >= minUsd) push({ ts: Date.now(), sym, side, usd, kind });
          return;
        }
      } catch {}
    };

    function push(item) {
      setRows(prev => {
        const next = [item, ...prev];
        if (next.length > maxKeep) next.length = maxKeep;
        return next;
      });
    }

    return () => { alive = false; try { ws.close(); } catch {} };
  }, [url, symbols, minUsd, maxKeep]);

  return (
    <div style={{border:"1px solid #25304a", borderRadius:12, overflow:"hidden", background:"#0f1320"}}>
      <Header />
      <div style={{maxHeight: 520, overflowY:"auto"}}>
        {rows.length === 0 && (
          <div style={{padding:"12px 14px", opacity:.75}}>Akış bekleniyor…</div>
        )}
        {rows.map((r, i) => <Row key={r.ts + "-" + i} it={r} />)}
      </div>
    </div>
  );
}

function Header(){
  return (
    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr",
                 padding:"10px 12px", background:"#151b2c", color:"#cfe2ff", fontWeight:800}}>
      <div>Zaman</div>
      <div>Sembol</div>
      <div>Taraf</div>
      <div style={{textAlign:"right"}}>Tutar (USD)</div>
    </div>
  );
}

function Row({ it }){
  const dt = new Date(it.ts);
  const hh = String(dt.getHours()).padStart(2,"0");
  const mm = String(dt.getMinutes()).padStart(2,"0");
  const ss = String(dt.getSeconds()).padStart(2,"0");
  const time = `${hh}:${mm}:${ss}`;
  const usdStr = Math.round(it.usd).toLocaleString("tr-TR");

  const colorSide = it.side.includes("Lik") ? "#ff6b6b" : (it.side === "Alış" ? "#22d39a" : "#ffb04a");
  const bg = it.kind === "liq" ? "rgba(255,107,107,0.06)" : "transparent";

  return (
    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr",
                 padding:"10px 12px", borderTop:"1px solid #141a2a", background:bg}}>
      <div style={{opacity:.85}}>{time}</div>
      <div style={{fontWeight:800, color:"#9bd0ff"}}>{it.sym}</div>
      <div style={{fontWeight:800, color:colorSide}}>{it.side}</div>
      <div style={{textAlign:"right", fontWeight:800}}>{usdStr}$</div>
    </div>
  );
}
