// pages/whales.js
import dynamic from "next/dynamic";
import React, { useMemo, useState } from "react";

const WhaleStream = dynamic(() => import("../components/WhaleStream"), { ssr:false });

// "Diğer" sekmesi için: BTC/ETH hariç yaygın USDT perpetual listesi
const OTHERS = [
  "SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","AVAXUSDT","TRXUSDT","LINKUSDT",
  "MATICUSDT","ATOMUSDT","NEARUSDT","APTUSDT","OPUSDT","ARBUSDT","SUIUSDT","DOTUSDT",
  "PEPEUSDT","TONUSDT","SEIUSDT","TIAUSDT","WIFUSDT","ENAUSDT","FETUSDT","POLUSDT","PYTHUSDT"
];

export default function WhalesPage(){
  const [tab, setTab] = useState("BTC");
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
      <h1 style={{marginTop:0}}>Balina Sinyalleri</h1>

      <div style={{display:"flex", gap:8, marginBottom:12, flexWrap:"wrap"}}>
        {["BTC","ETH","Diğer","Arama"].map(k=>(
          <button key={k} onClick={()=>setTab(k)}
            style={{padding:"8px 12px", borderRadius:10, border:"1px solid #2b3758",
                    background: tab===k ? "#1c2742" : "transparent", color:"#dbe4ff", fontWeight:800, cursor:"pointer"}}>
            {k}
          </button>
        ))}
      </div>

      {tab === "BTC" && (
        <>
          <h3 style={{margin:"6px 0 10px"}}>BTC • büyük işlemler & likidasyonlar (≥ 200.000$)</h3>
          <WhaleStream symbols={["BTCUSDT"]} minUsd={200000} />
        </>
      )}

      {tab === "ETH" && (
        <>
          <h3 style={{margin:"6px 0 10px"}}>ETH • büyük işlemler & likidasyonlar (≥ 200.000$)</h3>
          <WhaleStream symbols={["ETHUSDT"]} minUsd={200000} />
        </>
      )}

      {tab === "Diğer" && (
        <>
          <h3 style={{margin:"6px 0 10px"}}>Diğer Coinler • büyük işlemler & likidasyonlar (≥ 200.000$)</h3>
          <div style={{opacity:.7, fontSize:12, marginBottom:8}}>
            İzlenenler: {OTHERS.join(", ")}
          </div>
          <WhaleStream symbols={OTHERS} minUsd={200000} />
        </>
      )}

      {tab === "Arama" && (
        <>
          <h3 style={{margin:"6px 0 10px"}}>Özel Sembol</h3>
          <div style={{display:"flex", gap:8, alignItems:"center", marginBottom:10, flexWrap:"wrap"}}>
            <input
              value={q}
              onChange={e=>setQ(e.target.value)}
              onKeyDown={e=> e.key==="Enter" && doSearch()}
              placeholder="Sembol yaz (örn. SOL ya da SOLUSDT)"
              style={{padding:"8px 12px", background:"#121826", border:"1px solid #2b3247", borderRadius:10, color:"#e8ecf1", minWidth:240}}
            />
            <button onClick={doSearch}
              style={{padding:"8px 12px", background:"#2152a3", border:"1px solid #2e5fb6", borderRadius:10, color:"#fff", fontWeight:800}}>
              Ara
            </button>
            {searched && <span style={{opacity:.8}}>Gösterilen: <b>{searched}</b></span>}
          </div>

          {!searched && (
            <div style={{opacity:.75}}>
              Henüz bir sembol aramadın. Örnek: <b>SOL</b>, <b>BNB</b>, <b>XRP</b>… (USDT perpetual)
            </div>
          )}

          {searched && (
            <WhaleStream symbols={[searched]} minUsd={200000} />
          )}
        </>
      )}

      <p style={{opacity:.6, marginTop:12, fontSize:12}}>
        Kaynak: Binance Futures (aggTrade + forceOrder). Yatırım tavsiyesi değildir.
      </p>
    </main>
  );
}
