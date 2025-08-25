// components/WhaleTabs.jsx
"use client";
import React, { useEffect, useMemo, useState } from "react";

const WS = "wss://fstream.binance.com/stream";

/** Balina olaylarını üç seviyeye bölen sekmeli görünüm */
export default function WhaleTabs({
  symbols = ["BTCUSDT","ETHUSDT","BNBUSDT"],
  tiers = [
    { key:"t1", label:"$200k – $1M",  min: 200_000,  max: 1_000_000 },
    { key:"t2", label:"$1M – $5M",    min: 1_000_000, max: 5_000_000 },
    { key:"t3", label:"$5M+",         min: 5_000_000, max: Infinity  },
  ]
}) {
  const [tab, setTab] = useState("t1");
  const [lists, setLists] = useState({ t1:[], t2:[], t3:[] });

  const aggStreams = useMemo(() => symbols.slice(0,10).map(s=>`${s.toLowerCase()}@aggTrade`).join("/"), [symbols]);
  const url = useMemo(() => `${WS}?streams=${["!forceOrder", aggStreams].filter(Boolean).join("/")}`, [aggStreams]);

  useEffect(()=> {
    let alive = true; const ws = new WebSocket(url);
    ws.onmessage = (ev) => {
      if (!alive) return;
      try {
        const pkt = JSON.parse(ev.data); const d = pkt?.data;
        let sym, side, usd;
        if (d && d.o && d.e === "forceOrder") {
          const o = d.o; sym = String(o.s||"").toUpperCase(); side = o.S === "BUY" ? "Long Lik." : "Short Lik."; usd = Number(o.ap)*Number(o.q);
        } else if (d && d.e === "aggTrade") {
          sym = String(d.s||"").toUpperCase(); const price=Number(d.p), qty=Number(d.q); usd=price*qty; side = d.m ? "Satış" : "Alış";
        } else { return; }

        const now = Date.now();
        setLists(prev=>{
          const next = { ...prev };
          for (const t of tiers) {
            if (usd >= t.min && usd < t.max) {
              next[t.key] = [{ ts:now, sym, side, usd }, ...(prev[t.key]||[])].slice(0, 100);
              break;
            }
          }
          return next;
        });
      } catch {}
    };
    return ()=> { try{ ws.close(); }catch{} alive=false; };
  }, [url, tiers]);

  return (
    <div style={{border:"1px solid #25304a", borderRadius:12, overflow:"hidden", background:"#0f1320"}}>
      <div style={{display:"flex", background:"#151b2c", color:"#dbe4ff"}}>
        {tiers.map(t=>(
          <button key={t.key}
            onClick={()=>setTab(t.key)}
            style={{flex:1, padding:"10px 12px", fontWeight:800, color: tab===t.key ? "#cfe6ff" : "#9fb3d9",
                    background: tab===t.key ? "#18233b" : "transparent", border:"none", cursor:"pointer"}}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{maxHeight:420, overflowY:"auto"}}>
        <RowHeader />
        {(lists[tab]||[]).map((it,i)=> <Row key={i} it={it}/>)}
        {(!lists[tab] || lists[tab].length===0) && <div style={{padding:12, opacity:.7}}>Henüz kayıt yok…</div>}
      </div>
    </div>
  );
}

function RowHeader(){
  return (
    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", padding:"10px 12px", borderTop:"1px solid #141a2a", background:"#101626", color:"#a9b7d5", fontWeight:800}}>
      <div>Sembol</div><div>Taraf</div><div style={{textAlign:"right"}}>Tutar (USD)</div>
    </div>
  );
}
function Row({ it }){
  return (
    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", padding:"10px 12px", borderTop:"1px solid #141a2a"}}>
      <div style={{color:"#9bd0ff", fontWeight:800}}>{it.sym}</div>
      <div style={{color: it.side.includes("Lik") ? "#ff6b6b" : "#22d39a", fontWeight:800}}>{it.side}</div>
      <div style={{textAlign:"right", fontWeight:800}}>{Math.round(it.usd).toLocaleString("tr-TR")}$</div>
    </div>
  );
}
