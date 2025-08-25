// pages/balina2d.js
import dynamic from "next/dynamic";
import React, { useEffect, useMemo, useState } from "react";

const WhaleStream = dynamic(() => import("../components/WhaleStream"), { ssr:false });

export default function Balina2DPage(){
  const [all, setAll] = useState([]);        // BTC/ETH hariç TUM USDT perpetual
  const [q, setQ] = useState("");
  const [sym, setSym] = useState("");

  const searched = useMemo(()=>{
    if (!sym.trim()) return "";
    const raw = sym.trim().toUpperCase();
    return raw.endsWith("USDT") ? raw : raw + "USDT";
  }, [sym]);

  useEffect(()=>{
    let stop=false;
    async function pull(){
      try{
        const r = await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo", { cache:"no-store" });
        const j = await r.json();
        const syms = (j?.symbols||[])
          .filter(s => s?.contractType==="PERPETUAL" && s?.status==="TRADING" && /USDT$/.test(s?.symbol||""))
          .map(s => s.symbol.toUpperCase())
          .filter(s => s !== "BTCUSDT" && s !== "ETHUSDT");
        if (!stop && syms.length) setAll(Array.from(new Set(syms)));
      }catch{}
    }
    pull(); return ()=>{ stop=true; };
  },[]);

  function doSearch(){
    if (!q.trim()) { setSym(""); return; }
    setSym(q);
  }

  return (
    <main style={{minHeight:"100vh", background:"#0f1320", color:"#e6f0ff", padding:"16px 18px", paddingBottom:60}}>
      <h1 style={{marginTop:0}}>Balina2D — Diğer Tüm Coinler (Canlı)</h1>

      {/* Arama çubuğu */}
      <div style={{display:"flex", gap:8, alignItems:"center", margin:"6px 0 12px", flexWrap:"wrap"}}>
        <input
          value={q}
          onChange={e=>setQ(e.target.value)}
          onKeyDown={e=> e.key==="Enter" && doSearch()}
          placeholder="Sembol yaz (örn. SOL ya da SOLUSDT)"
          style={{padding:"8px 12px", background:"#121826", border:"1px solid #2b3247", borderRadius:10, color:"#e8ecf1", minWidth:260}}
        />
        <button onClick={doSearch}
          style={{padding:"8px 12px", background:"#2152a3", border:"1px solid #2e5fb6", borderRadius:10, color:"#fff", fontWeight:800}}>
          Ara
        </button>
        {searched && <span style={{opacity:.8}}>Gösterilen: <b>{searched}</b></span>}
        <span style={{opacity:.65, marginLeft:8, fontSize:12}}>Eşik: ≥ 200.000$ (aggTrade + likidasyon)</span>
      </div>

      <div
        style={{
          display:"grid",
          gridTemplateColumns:"repeat(auto-fit, minmax(360px, 1fr))",
          gap:12
        }}
      >
        {/* Diğer Tüm Coinler */}
        <section style={{border:"1px solid #25304a", borderRadius:12, overflow:"hidden", background:"#0f1320"}}>
          <div style={{padding:"10px 12px", background:"#151b2c", fontWeight:800, color:"#9bd0ff"}}>
            Diğer (BTC/ETH Hariç Tümü)
          </div>
          <div style={{opacity:.7, fontSize:12, padding:"8px 12px", borderTop:"1px solid #141a2a"}}>
            İzlenen sembol sayısı: {all.length || "—"}
          </div>
          <WhaleStream symbols={all} minUsd={200000} />
        </section>

        {/* Aranan Tek Coin (opsiyonel 2. panel) */}
        {searched && (
          <section style={{border:"1px solid #25304a", borderRadius:12, overflow:"hidden", background:"#0f1320"}}>
            <div style={{padding:"10px 12px", background:"#151b2c", fontWeight:800, color:"#9bd0ff"}}>{searched}</div>
            <WhaleStream symbols={[searched]} minUsd={200000} />
          </section>
        )}
      </div>

      <p style={{opacity:.6, marginTop:12, fontSize:12}}>
        Kaynak: Binance Futures. Bilgi amaçlıdır, yatırım tavsiyesi değildir.
      </p>
    </main>
  );
}
