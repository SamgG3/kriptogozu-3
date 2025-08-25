// pages/whales.js
import dynamic from "next/dynamic";
import React from "react";

const WhaleStream = dynamic(() => import("../components/WhaleStream"), { ssr:false });

export default function WhalesPage(){
  return (
    <main style={{minHeight:"100vh", background:"#0f1320", color:"#e6f0ff", padding:"16px 18px", paddingBottom:60}}>
      <h1 style={{marginTop:0}}>Balina Sinyalleri (BTC & ETH)</h1>

      <div
        style={{
          display:"grid",
          gridTemplateColumns:"repeat(auto-fit, minmax(360px, 1fr))",
          gap:12
        }}
      >
        {/* BTC */}
        <section style={{border:"1px solid #25304a", borderRadius:12, overflow:"hidden", background:"#0f1320"}}>
          <div style={{padding:"10px 12px", background:"#151b2c", fontWeight:800, color:"#9bd0ff"}}>BTC</div>
          <WhaleStream symbols={["BTCUSDT"]} minUsd={200000} />
        </section>

        {/* ETH */}
        <section style={{border:"1px solid #25304a", borderRadius:12, overflow:"hidden", background:"#0f1320"}}>
          <div style={{padding:"10px 12px", background:"#151b2c", fontWeight:800, color:"#9bd0ff"}}>ETH</div>
          <WhaleStream symbols={["ETHUSDT"]} minUsd={200000} />
        </section>
      </div>

      <p style={{opacity:.6, marginTop:12, fontSize:12}}>
        Kaynak: Binance Futures. Bilgi amaçlıdır, yatırım tavsiyesi değildir.
      </p>
    </main>
  );
}
