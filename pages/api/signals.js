// pages/sinyal.js
import React, { useEffect, useRef, useState } from "react";

const REFRESH_MS = 4000;        // daha stabil
const API_URL    = "/api/signals?n=80"; // hızlı tarama; sonra istersen ?all=1 yaparsın

export default function Sinyal() {
  const [signals, setSignals] = useState([]);
  const [ts, setTs] = useState(null);         // last updated
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;

    const load = async () => {
      try {
        const res = await fetch(API_URL, { cache: "no-store" });
        if (!res.ok) throw new Error("api");
        const data = await res.json();
        if (!aliveRef.current) return;
        const arr = Array.isArray(data?.signals) ? data.signals : [];
        // sadece açık sinyaller (tp/sl/cancelled hariç)
        const open = arr.filter(s => !["tp","sl","cancelled"].includes(String(s.status||"").toLowerCase()));
        setSignals(open);
        setTs(Date.now());
      } catch {
        // Hata olsa bile UI'yı boşaltma; eski state dursun
      } finally {
        if (aliveRef.current) setLoading(false);
      }
    };

    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => {
      aliveRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const longs  = signals.filter(s => String(s.side).toUpperCase()==="LONG")
                        .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  const shorts = signals.filter(s => String(s.side).toUpperCase()==="SHORT")
                        .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));

  return (
    <main style={{minHeight:"100vh", padding:"16px", background:"#0c111c", color:"#e5e7eb"}}>
      <div style={{maxWidth:1200, margin:"0 auto"}}>
        <Header ts={ts} loading={loading} />
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16}}>
          <Column title="SHORT" items={shorts} />
          <Column title="LONG"  items={longs} />
        </div>
      </div>
    </main>
  );
}

function Header({ts, loading}) {
  return (
    <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
      <h1 style={{fontSize:18, fontWeight:700, opacity:0.9}}>Sinyal</h1>
      <div style={{fontSize:12, opacity:0.7}}>
        {loading ? "Yükleniyor…" : ts ? `Güncellendi: ${new Date(ts).toLocaleTimeString("tr-TR")}` : ""}
      </div>
    </div>
  );
}

function Column({ title, items }) {
  return (
    <section>
      <div style={{marginBottom:8, fontWeight:600, opacity:0.8}}>{title}</div>
      {items.length === 0 ? (
        <Skeleton />
      ) : (
        items.map(s => <Card key={s.id} s={s} />)
      )}
    </section>
  );
}

function Skeleton(){
  return (
    <div style={{
      border:"1px solid #1a2033", background:"#0f1320", borderRadius:16,
      height:48, opacity:0.6
    }}/>
  );
}

function Card({ s }) {
  const side = String(s.side||"").toUpperCase();
  const isLong = side==="LONG";
  const tagStyle = {
    padding:"4px 10px", borderRadius:999, fontSize:12, fontWeight:700,
    background:isLong ? "rgba(16,185,129,0.15)" : "rgba(244,63,94,0.15)",
    color:     isLong ? "rgb(110,231,183)"       : "rgb(252,165,165)"
  };
  const dec = (v)=> (v>1000?1:4);

  return (
    <article style={{
      border:"1px solid #1a2033", background:"#0f1320", borderRadius:16, padding:16, marginBottom:12
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
        <div style={{fontWeight:600}}>{fmtSymbol(s.symbol)}</div>
        <div style={{display:"flex", gap:12, alignItems:"center"}}>
          <div style={{opacity:0.9}}>{fmt(s.price, dec(s.price))}</div>
          <span style={tagStyle}>{side}</span>
        </div>
      </div>

      <div style={{height:1, background:"#1a2033", margin:"12px 0"}} />

      <div style={{display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8}}>
        <KV k="ENTRY" v={fmt(s.entry, dec(s.entry))} />
        <KV k="SL"    v={fmt(s.sl,    dec(s.sl))} />
        {"tp1" in s ? <KV k="TP1" v={fmt(s.tp1, dec(s.tp1))}/> : null}
        {"tp2" in s ? <KV k="TP2" v={fmt(s.tp2, dec(s.tp2))}/> : null}
        {"tp3" in s ? <KV k="TP3" v={fmt(s.tp3, dec(s.tp3))}/> : null}
      </div>
    </article>
  );
}

function KV({k,v}){
  return (
    <div style={{border:"1px solid #131a2a", background:"#0b0e17", borderRadius:12, padding:10, textAlign:"center"}}>
      <div style={{fontSize:10, textTransform:"uppercase", opacity:0.6}}>{k}</div>
      <div style={{marginTop:4}}>{v}</div>
    </div>
  );
}

function fmt(v, d=2){
  if (v==null || isNaN(v)) return "—";
  return Number(v).toLocaleString("tr-TR", { minimumFractionDigits:d, maximumFractionDigits:d });
}
function fmtSymbol(sym=""){
  const s = String(sym).toUpperCase();
  if (s.endsWith("USDT")) return s.replace("USDT","/USDT");
  if (s.endsWith("USD"))  return s.replace("USD","/USD");
  return s;
}
