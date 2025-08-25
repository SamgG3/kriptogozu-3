// pages/whales.js
import dynamic from "next/dynamic";
import React, { useMemo, useState } from "react";

const WhaleTabs = dynamic(() => import("../components/WhaleTabs"), { ssr:false });

const TIERS = [
  { key:"t1", label:"$200k – $1M",  min: 200_000,  max: 1_000_000 },
  { key:"t2", label:"$1M – $5M",    min: 1_000_000, max: 5_000_000 },
  { key:"t3", label:"$5M+",         min: 5_000_000, max: Infinity  },
];

export default function WhalesPage(){
  const [tab, setTab] = useState("BTC");
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");

  const searchedSymbol = useMemo(()=>{
    const raw = (searched||"").trim().toUpperCase();
    if (!raw) return "";
    return raw.endsWith("USDT") ? raw : `${raw}USDT`;
  }, [searched]);

  function doSearch(){
    if (!query.trim()) { setSearched(""); return; }
    setSearched(query);
  }

  return (
    <main style={{minHeight:"100vh", background:"#0f1320", color:"#e6f0ff", padding:"16px 18px", paddingBottom:60}}>
      <h1 style={{marginTop:0}}>Balina Sinyalleri</h1>
      <div style={{display:"flex", gap:8, marginBottom:12}}>
        {["BTC","ETH","Arama"].map(k=>(
          <button key={k} onClick={()=>setTab(k)}
            style={{padding:"8px 12px", borderRadius:10, border:"1px solid #2b3758",
                    background: tab===k ? "#1c2742" : "transparent", color:"#dbe4ff", fontWeight:800, cursor:"pointer"}}>
            {k}
          </button>
        ))}
      </div>

      {tab==="BTC" && (
        <>
          <h3 style={{margin:"6px 0 10px"}}>BTC • büyük işlemler & likidasyonlar</h3>
          <WhaleTabs symbols={["BTCUSDT"]} tiers={TIERS} />
        </>
      )}

      {tab==="ETH" && (
        <>
          <h3 style={{margin:"6px 0 10px"}}>ETH • büyük işlemler & likidasyonlar</h3>
          <WhaleTabs symbols={["ETHUSDT"]} tiers={TIERS} />
        </>
      )}

      {tab==="Arama" && (
        <>
          <h3 style={{margin:"6px 0 10px"}}>Özel Sembol</h3>
          <div style={{display:"flex", gap:8, alignItems:"center", marginBottom:10, flexWrap:"wrap"}}>
            <input
              value={query}
              onChange={e=>setQuery(e.target.value)}
              onKeyDown={e=> e.key==="Enter" && doSearch()}
              placeholder="Sembol yaz (örn. SOL ya da SOLUSDT)"
              style={{padding:"8px 12px", background:"#121826", border:"1px solid #2b3247", borderRadius:10, color:"#e8ecf1", minWidth:240}}
            />
            <button onClick={doSearch}
              style={{padding:"8px 12px", background:"#2152a3", border:"1px solid #2e5fb6", borderRadius:10, color:"#fff", fontWeight:800}}>
              Ara
            </button>
            {searched && <span style={{opacity:.8}}>Gösterilen: <b>{searchedSymbol}</b></span>}
          </div>

          {!searched && (
            <div style={{opacity:.75}}>
              Henüz bir sembol aramadın. Örnek: <b>SOL</b>, <b>BNB</b>, <b>XRP</b>… (USDT perpetual)
            </div>
          )}

          {searched && (
            <WhaleTabs symbols={[searchedSymbol]} tiers={TIERS} />
          )}
        </>
      )}

      <p style={{opacity:.6, marginTop:12, fontSize:12}}>Not: Borsa içi akış (Binance Futures). Oran/sinyal amaçlıdır, yatırım tavsiyesi değildir.</p>
    </main>
  );
}
