// pages/whales.js
import dynamic from "next/dynamic";
import React, { useMemo, useState } from "react";

const WhaleStream = dynamic(() => import("../components/WhaleStream"), { ssr:false });

// "Diğer" için BTC/ETH hariç yaygın USDT perpetual listesi
const OTHERS = [
  "SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","AVAXUSDT","TRXUSDT","LINKUSDT",
  "MATICUSDT","ATOMUSDT","NEARUSDT","APTUSDT","OPUSDT","ARBUSDT","SUIUSDT","DOTUSDT",
  "PEPEUSDT","TONUSDT","SEIUSDT","TIAUSDT","WIFUSDT","ENAUSDT","FETUSDT","POLUSDT","PYTHUSDT"
];

export default function WhalesPage(){
  const [q, setQ] = useState("");
  const [sym, setSym] = useState(""); // aranan geçerli sembol

  const searched = useMemo(()=>{
    if (!sym.trim()) return "";
    const raw = sym.trim().toUpperCase();
    return raw.endsWith("USDT") ? raw : raw + "USDT";
  }, [sym]);

  function doSearch(){
    if (!q.trim()) { setSym(""); return; }
    setSym(q);
  }

  return (
    <main style={{minHeight:"100vh", background:"#0f1320", color:"#e6f0ff", padding:"16px 18px", paddingBottom:60}}>
      <h1 style={{marginTop:0}}>Balina Sinyalleri (Canlı)</h1>

      {/* Arama çubuğu */}
      <div style={{display:"flex", gap:8, alignItems:"center", margin:"6px 0 16px", flexWrap:"wrap"}}>
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

      {/* Yan yana canlı paneller */}
      <div
        style={{
          display:"grid",
          gridTemplateColumns:"repeat(auto-fit, minmax(320px, 1fr))",
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

        {/* Diğer (BTC/ETH hariç toplu) */}
        <section style={{border:"1px solid #25304a", borderRadius:12, overflow:"hidden", background:"#0f1320"}}>
          <div style={{padding:"10px 12px", background:"#151b2c", fontWeight:800, color:"#9bd0ff"}}>Diğer</div>
          <div style={{opacity:.7, fontSize:12, padding:"8px 12px", borderTop:"1px solid #141a2a"}}>
            İzlenenler: {OTHERS.join(", ")}
          </div>
          <WhaleStream symbols={OTHERS} minUsd={200000} />
        </section>

        {/* Aranan tek coin (varsa 4. panel olarak eklenir) */}
        {searched && (
          <section style={{border:"1px solid #25304a", borderRadius:12, overflow:"hidden", background:"#0f1320"}}>
            <div style={{padding:"10px 12px", background:"#151b2c", fontWeight:800, color:"#9bd0ff"}}>{searched}</div>
            <WhaleStream symbols={[searched]} minUsd={200000} />
          </section>
        )}
      </div>

      <p style={{opacity:.6, marginTop:12, fontSize:12}}>
        Kaynak: Binance Futures. Gösterimler bilgi amaçlıdır, yatırım tavsiyesi değildir.
      </p>
    </main>
  );
}
