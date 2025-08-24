// pages/admin/index.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";

const RealtimePanel = dynamic(() => import("../../components/RealtimePanel"), { ssr: false });

const DEFAULTS = ["BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","ADAUSDT","DOGEUSDT"];

export default function Admin() {
  const router = useRouter();

  const [symbols, setSymbols] = useState(DEFAULTS);
  const [query, setQuery] = useState("");
  const [interval, setIntervalStr] = useState("1m");
  const [auto, setAuto] = useState(false);
  const timer = useRef(null);

  // admin sembol listesi localStorage’dan yüklenir
  useEffect(()=>{
    if (typeof window==="undefined") return;
    try {
      const raw = localStorage.getItem("kg-admin-symbols");
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length) setSymbols(arr.map(s=>String(s).toUpperCase()));
      }
    } catch {}
  },[]);

  const filtered = useMemo(()=>{
    const q = query.trim().toUpperCase();
    if (!q) return symbols;
    return symbols.filter(s=>s.includes(q));
  }, [query, symbols]);

  // Sembol düzenleme alanı
  const [editText, setEditText] = useState(()=>{
    return DEFAULTS.join(", ");
  });
  useEffect(()=>{
    setEditText(symbols.join(", "));
  }, [symbols]);

  function saveSymbols() {
    const arr = editText
      .split(/[,\s]+/)
      .map(s=>s.trim().toUpperCase())
      .filter(Boolean);
    const uniq = Array.from(new Set(arr));
    if (!uniq.length) return;
    setSymbols(uniq);
    try { localStorage.setItem("kg-admin-symbols", JSON.stringify(uniq)); } catch {}
  }

  useEffect(()=>{
    if (timer.current) clearInterval(timer.current);
    if (auto) timer.current = setInterval(()=>{}, 10000);
    return ()=> { if (timer.current) clearInterval(timer.current); };
  }, [auto]);

  const rootStyle = {
    padding: "16px 18px",
    background: "#0b0d14",
    minHeight: "100vh",
    color: "#f2f4f8",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
  };

  return (
    <main style={rootStyle}>
      <h1 style={{marginTop:0}}>Admin Paneli</h1>

      {/* Üst kontrol çubuğu */}
      <div style={{display:"flex", flexWrap:"wrap", gap:12, alignItems:"center", marginBottom:14}}>
        <input
          value={query}
          onChange={e=>setQuery(e.target.value)}
          placeholder="Sembol ara (örn: BTC)"
          style={{padding:"8px 12px", background:"#121826", border:"1px solid #2b3247", borderRadius:10, color:"#e8ecf1", minWidth:220}}
        />
        <select value={interval} onChange={e=>setIntervalStr(e.target.value)}
          style={{padding:"8px 10px", background:"#121826", border:"1px solid #2b3247", borderRadius:10, color:"#e8ecf1"}}>
          {["1m","5m","15m","1h","4h"].map(x=><option key={x} value={x}>{x}</option>)}
        </select>
        <label style={{display:"flex", alignItems:"center", gap:8}}>
          <input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/>
          10 sn’de bir otomatik yenile (görsel)
        </label>
        <button
          onClick={()=>router.push("/")}
          style={{padding:"8px 12px", background:"#2a2f45", border:"1px solid #3a4360", borderRadius:10, color:"#fff", fontWeight:800}}>
          Ana Panele Dön
        </button>
      </div>

      {/* Sembol yönetimi */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16}}>
        <div style={{border:"1px solid #26314a", borderRadius:12, padding:12, background:"#0f1320"}}>
          <div style={{fontWeight:800, marginBottom:8}}>Aktif Semboller</div>
          <div style={{fontSize:13, opacity:.8, marginBottom:8}}>
            Virgül veya boşlukla ayır: <i>BTCUSDT, ETHUSDT ...</i>
          </div>
          <textarea
            value={editText}
            onChange={e=>setEditText(e.target.value)}
            rows={6}
            style={{width:"100%", padding:10, borderRadius:8, background:"#0e1526", border:"1px solid #26314a", color:"#e8ecf1"}}
          />
          <div style={{display:"flex", gap:8, marginTop:8}}>
            <button
              onClick={saveSymbols}
              style={{padding:"8px 12px", background:"#1b2235", border:"1px solid #2e3750", borderRadius:10, color:"#fff", fontWeight:800}}>
              Kaydet
            </button>
            <button
              onClick={()=>{ setEditText(DEFAULTS.join(", ")); }}
              style={{padding:"8px 12px", background:"#152033", border:"1px solid #233148", borderRadius:10, color:"#e8ecf1"}}>
              Varsayılanları Yükle
            </button>
          </div>
          <div style={{opacity:.7, marginTop:6, fontSize:12}}>Toplam: {symbols.length}</div>
        </div>

        <div style={{border:"1px solid #26314a", borderRadius:12, padding:12, background:"#0f1320"}}>
          <div style={{fontWeight:800, marginBottom:8}}>Önizleme (Filtre uygulanır)</div>
          <div style={{opacity:.75, fontSize:12, marginBottom:8}}>Semboller: {filtered.join(", ") || "—"}</div>
          <div style={{border:"1px solid #232a3d", borderRadius:12, overflow:"hidden"}}>
            <div style={{display:"grid", gridTemplateColumns:"3fr 2fr 2fr 2fr 2fr 1fr", padding:"10px 12px", fontWeight:700, background:"#151b2c", color:"#dbe4ff"}}>
              <div>Sembol</div>
              <div style={{textAlign:"right"}}>Fiyat</div>
              <div style={{textAlign:"right"}}>24s Değişim</div>
              <div style={{textAlign:"center"}}>Risk</div>
              <div style={{textAlign:"center"}}>Long/Short</div>
              <div style={{textAlign:"center"}}>⭐</div>
            </div>
            <RealtimePanel
              symbols={filtered}
              staleAfterMs={5000}
              longShortFetchEveryMs={30000}
              onOpenDetails={(symbol)=>router.push(`/coin/${symbol}`)}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
