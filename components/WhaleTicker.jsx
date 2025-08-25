// components/WhaleTicker.jsx
"use client";
import React, { useEffect, useMemo, useState } from "react";

const WS = "wss://fstream.binance.com/stream";

export default function WhaleTicker({
  symbols = ["BTCUSDT","ETHUSDT","BNBUSDT"],
  bigTradeUsd = 200000,
  maxKeep = 30
}) {
  const [queue, setQueue] = useState([]);

  const aggStreams = useMemo(() => symbols.slice(0,10).map(s=>`${s.toLowerCase()}@aggTrade`).join("/"), [symbols]);
  const url = useMemo(() => `${WS}?streams=${["!forceOrder", aggStreams].filter(Boolean).join("/")}`, [aggStreams]);

  useEffect(()=> {
    let alive = true; const ws = new WebSocket(url);
    ws.onmessage = (ev) => {
      if (!alive) return;
      try {
        const pkt = JSON.parse(ev.data); const d = pkt?.data;
        if (d && d.o && d.e === "forceOrder") {
          const o = d.o, sym = String(o.s||"").toUpperCase(), side = o.S === "BUY" ? "Long Lik." : "Short Lik.";
          const usd = Number(o.ap) * Number(o.q);
          push({ kind:"liq", sym, side, usd }); return;
        }
        if (d && d.e === "aggTrade") {
          const sym = String(d.s||"").toUpperCase(), price = Number(d.p), qty = Number(d.q); const usd = price * qty;
          if (usd >= bigTradeUsd) push({ kind:"big", sym, side: d.m ? "Satış" : "Alış", usd });
        }
      } catch {}
    };
    function push(item){ setQueue(prev => { const next=[...prev,item]; if(next.length>maxKeep) next.shift(); return next; }); }
    return ()=> { alive=false; try{ ws.close(); }catch{} };
  }, [url, bigTradeUsd, maxKeep]);

  const line = useMemo(()=>{
    if (!queue.length) return "Balina sinyalleri bekleniyor…";
    return queue.map(it => {
      const usd = Math.round(it.usd).toLocaleString("tr-TR");
      return it.kind==="liq" ? `⚠️ Likidasyon • ${it.sym} • ${it.side} • ${usd}$` : `🐋 Büyük İşlem • ${it.sym} • ${it.side} • ${usd}$`;
    }).join("   •   ");
  }, [queue]);

  return (
    <div style={{ position:"fixed", left:0, right:0, bottom:0, zIndex:50, background:"#0b0f1a", borderTop:"1px solid #1c2438", padding:"6px 0", overflow:"hidden" }}>
      <div style={{ whiteSpace:"nowrap", display:"inline-block", paddingLeft:"100%", animation:"kg-marquee 30s linear infinite", color:"#cfe6ff", fontWeight:700 }}>
        {line}
      </div>
      <style jsx>{` @keyframes kg-marquee { from { transform: translateX(0); } to { transform: translateX(-100%); } } `}</style>
    </div>
  );
}


