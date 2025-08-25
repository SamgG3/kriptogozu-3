// pages/whales.js
import dynamic from "next/dynamic";
import React, { useState } from "react";

const WhaleTabs = dynamic(() => import("../components/WhaleTabs"),   { ssr:false });

const CORE = ["BTCUSDT","ETHUSDT","BNBUSDT"];

export default function WhalesPage(){
  const [symbols] = useState(CORE);
  return (
    <main style={{minHeight:"100vh", background:"#0f1320", color:"#e6f0ff", padding:"16px 18px", paddingBottom:60}}>
      <h1 style={{marginTop:0}}>Balina Sinyalleri</h1>
      <p style={{opacity:.8, marginTop:0}}>Likidasyonlar ve büyük işlemler üç seviyede gruplandı.</p>
      <WhaleTabs symbols={symbols} />
      <p style={{opacity:.6, marginTop:10, fontSize:12}}>Not: Sadece oran/sinyal amaçlıdır. Yatırım tavsiyesi değildir.</p>
    </main>
  );
}
