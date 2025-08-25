// components/WhaleStream.jsx
"use client";
import React, { useEffect, useMemo, useState } from "react";

const WS = "wss://fstream.binance.com/stream";

/** Diziyi parça parça kır (batch) */
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Tek listede balina akışı (likidasyon + büyük işlem).
 * - symbols: izlenecek USDT perpetual sembolleri (örn. ["BTCUSDT","ETHUSDT"])
 * - minUsd: eşik (varsayılan 200k)
 * - maxKeep: listede tutulacak maksimum kayıt
 * - batchSize: tek WS bağlantısında kaç sembol (varsayılan 50)
 *
 * Not: Çok sayıda sembolde çalışmak için sembolleri batch'lere bölüp
 * birden fazla websocket açıyoruz. "!forceOrder" stream'ini sadece ilk WS'e ekliyoruz.
 */
export default function WhaleStream({
  symbols = ["BTCUSDT"],
  minUsd = 200_000,
  maxKeep = 500,
  batchSize = 50
}) {
  const [rows, setRows] = useState([]);

  const cleanSymbols = useMemo(() => {
    // Normalleştir ve tekrarları at
    const set = new Set((symbols || []).map(s => String(s || "").toUpperCase().trim()).filter(Boolean));
    return Array.from(set);
  }, [symbols]);

  const batches = useMemo(() => chunk(cleanSymbols, batchSize), [cleanSymbols, batchSize]);

  useEffect(() => {
    if (!cleanSymbols.length) return;
    let alive = true;
    const sockets = [];

    function handleData(d) {
      try {
        let sym, side, usd, kind;

        // Likidasyonlar
        if (d && d.e === "forceOrder" && d.o) {
          const o = d.o;
          sym  = String(o.s || "").toUpperCase();
          if (!cleanSymbols.includes(sym)) return;
          side = o.S === "BUY" ? "Long Lik." : "Short Lik.";
          usd  = Number(o.ap) * Number(o.q);
          kind = "liq";
          if (usd >= minUsd) push({ ts: Date.now(), sym, side, usd, kind });
          return;
        }

        // Büyük işlemler (aggTrade)
        if (d && d.e === "aggTrade") {
          sym  = String(d.s || "").toUpperCase();
          if (!cleanSymbols.includes(sym)) return;
          const price = Number(d.p);
          const qty   = Number(d.q);
          usd  = price * qty;
          side = d.m ? "Satış" : "Alış";
          kind = "big";
          if (usd >= minUsd) push({ ts: Date.now(), sym, side, usd, kind });
          return;
        }
      } catch {}
    }

    function push(item) {
      setRows(prev => {
        const next = [item, ...prev];
        if (next.length > maxKeep) next.length = maxKeep;
        return next;
      });
    }

    // Her batch için ayrı WS
    batches.forEach((batch, idx) => {
      const aggStreams = batch.map(s => `${s.toLowerCase()}@aggTrade`).join("/");
      const streams = [];
      if (idx === 0) streams.push("!forceOrder"); // forceOrder sadece ilk WS'te
      if (aggStreams) streams.push(aggStreams);
      if (!streams.length) return;

      const url = `${WS}?streams=${streams.join("/")}`;
      const ws = new WebSocket(url);
      sockets.push(ws);

      ws.onmessage = (ev) => {
        if (!alive) return;
        try {
          const msg = JSON.parse(ev.data);
          const d = msg?.data;
          if (d) handleData(d);
        } catch {}
      };
      ws.onerror = () => {}; // sessiz
    });

    return () => {
      alive = false;
      sockets.forEach(ws => { try { ws.close(); } catch {} });
    };
  }, [batches, cleanSymbols, minUsd, maxKeep]);

  return (
    <div style={{borderTop:"1px solid #25304a"}}>
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
                 padding:"10px 12px", background:"#101626", color:"#cfe2ff", fontWeight:800}}>
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
