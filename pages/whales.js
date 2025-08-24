// pages/whales.js
import dynamic from "next/dynamic";
import React, { useState } from "react";

const WhaleTape = dynamic(() => import("../components/WhaleTape"),   { ssr:false });
const WhaleTicker = dynamic(() => import("../components/WhaleTicker"), { ssr:false });

const CORE = ["BTCUSDT","ETHUSDT","BNBUSDT"];

export default function WhalesPage(){
  const [threshold, setThreshold] = useState(200000);

  return (
    <main style={{minHeight:"100vh", background:"#0f1320", color:"#e6f0ff", padding:"16px 18px", paddingBottom:60}}>
      <h1 style={{marginTop:0}}>Balina Sinyalleri</h1>
      <div style={{display:"flex", gap:10, alignItems:"center", marginBottom:12}}>
        <span>Eşik (USD):</span>
        <input
          type="number"
          value={threshold}
          onChange={e=>setThreshold(Number(e.target.value||0))}
          style={{width:140, padding:"6px 8px", background:"#121826", border:"1px solid #2b3247", borderRadius:8, color:"#e8ecf1"}}
        />
      </div>

      <WhaleTape symbols={CORE} bigTradeUsd={threshold} />

      {/* Alt bant her sayfada görmek istersen _app içine de alınabilir. Burada da gösterelim: */}
      <WhaleTicker symbols={CORE} bigTradeUsd={threshold} />
    </main>
  );
}
