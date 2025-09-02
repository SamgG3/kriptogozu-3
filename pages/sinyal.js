// pages/sinyal.js
import React, { useEffect, useState } from "react";

const REFRESH_MS = 3000;

export default function Sinyal() {
  const [signals, setSignals] = useState([]);

  useEffect(() => {
    let timer;
    const load = async () => {
      try {
        const res = await fetch("/api/signals", { cache: "no-store" });
        if (!res.ok) throw new Error("api error");
        const data = await res.json();
        if (data && Array.isArray(data.signals)) {
          setSignals(data.signals.filter(s => {
            const st = String(s.status || "").toLowerCase();
            return !["tp","sl","cancelled"].includes(st);
          }));
        } else {
          setSignals([]);
        }
      } catch {
        setSignals([]);
      }
    };
    load();
    timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const longs  = signals.filter(s => String(s.side).toUpperCase() === "LONG")
                        .sort((a,b) => (b.createdAt||0)-(a.createdAt||0));
  const shorts = signals.filter(s => String(s.side).toUpperCase() === "SHORT")
                        .sort((a,b) => (b.createdAt||0)-(a.createdAt||0));

  return (
    <main style={{minHeight:"100vh", padding:"16px"}}>
      {/* İki sütun: SOL=SHORT, SAĞ=LONG */}
      <div style={{
        display:"grid",
        gridTemplateColumns:"1fr 1fr",
        gap:"16px",
        maxWidth: "1200px",
        margin: "0 auto"
      }}>
        <Column title="SHORT" items={shorts} />
        <Column title="LONG"  items={longs} />
      </div>
    </main>
  );
}

function Column({ title, items }) {
  return (
    <section>
      <div style={{marginBottom:8, fontWeight:600, opacity:0.8}}>{title}</div>
      {items.length === 0 ? (
        <div style={{height:40, border:"1px solid #1a2033", borderRadius:12}} />
      ) : (
        items.map(s => <Card key={s.id} s={s} />)
      )}
    </section>
  );
}

function Card({ s }) {
  const side = String(s.side || "").toUpperCase();
  const isLong = side === "LONG";
  const tagStyle = {
    padding:"4px 10px",
    borderRadius:999,
    fontSize:12,
    fontWeight:700,
    background:isLong ? "rgba(16,185,129,0.15)" : "rgba(244,63,94,0.15)",
    color:     isLong ? "rgb(110,231,183)"       : "rgb(252,165,165)"
  };
  return (
    <article style={{
      border:"1px solid #1a2033",
      background:"#0f1320",
      borderRadius:16,
      padding:16,
      marginBottom:12
    }}>
      {/* Üst satır: Sembol | Fiyat | Yön */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
        <div style={{fontWeight:600}}>{fmtSymbol(s.symbol)}</div>
        <div style={{display:"flex", gap:12, alignItems:"center"}}>
          <div style={{opacity:0.9}}>{fmt(s.price, s.price > 1000 ? 1 : 4)}</div>
          <span style={tagStyle}>{side}</span>
        </div>
      </div>

      <div style={{height:1, background:"#1a2033", margin:"12px 0"}} />

      {/* Entry / SL / TP */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8}}>
        <KV k="Entry" v={fmt(s.entry, s.entry > 1000 ? 1 : 4)} />
        <KV k="SL"    v={fmt(s.sl,    s.sl    > 1000 ? 1 : 4)} />
        <KV k="TP"    v={fmt(s.tp,    s.tp    > 1000 ? 1 : 4)} />
      </div>
    </article>
  );
}

function KV({k,v}) {
  return (
    <div style={{border:"1px solid #131a2a", background:"#0b0e17", borderRadius:12, padding:10, textAlign:"center"}}>
      <div style={{fontSize:10, textTransform:"uppercase", opacity:0.6}}>{k}</div>
      <div style={{marginTop:4}}>{v}</div>
    </div>
  );
}

function fmt(v, d=2){
  if (v == null || isNaN(v)) return "—";
  return Number(v).toLocaleString("tr-TR", { minimumFractionDigits:d, maximumFractionDigits:d });
}
function fmtSymbol(sym=""){
  const s = sym.toUpperCase();
  if (s.endsWith("USDT")) return s.replace("USDT","/USDT");
  if (s.endsWith("USD"))  return s.replace("USD","/USD");
  return s;
}
