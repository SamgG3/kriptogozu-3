// components/PriceBar.jsx
"use client";
import React, { useEffect, useState } from "react";

/** Basit fiyat barı:
 * - Kaynak: Binance spot USDTTRY (yaklaşık USD/TRY)
 * - 9 saniyede bir yeniler.
 */
export default function PriceBar() {
  const [usdtTry, setUsdtTry] = useState(null);
  const [err, setErr] = useState("");

  async function pull() {
    setErr("");
    try {
      const r = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=USDTTRY", { cache:"no-store" });
      const j = await r.json();
      const p = Number(j?.price);
      if (!isNaN(p)) setUsdtTry(p);
      else throw new Error("Geçersiz");
    } catch (e) {
      setErr("Fiyat alınamadı");
    }
  }

  useEffect(()=>{ pull(); const t = setInterval(pull, 9000); return ()=>clearInterval(t); },[]);

  const box = { padding:"6px 8px", background:"#0b0f1a", borderBottom:"1px solid #1c2438", color:"#cfe6ff", display:"flex", gap:12, alignItems:"center", justifyContent:"center", fontWeight:800 };
  return (
    <div style={box}>
      <span>₺ TL</span>
      <span style={{opacity:.6}}>|</span>
      <span>USDT/TRY: {usdtTry ? usdtTry.toLocaleString("tr-TR",{maximumFractionDigits:2}) : "—"}</span>
      <span style={{opacity:.75}}>(USD≈USDT)</span>
      {err && <span style={{color:"#ff8a8a", fontWeight:700, marginLeft:10}}>{err}</span>}
    </div>
  );
}
