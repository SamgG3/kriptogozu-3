// components/RealtimePanel.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Client-only realtime tablo (inline-style, Tailwind yok) */

const WS_BASE = "wss://fstream.binance.com/stream";
const REST_BASE = "https://fapi.binance.com";
const DEFAULT_SYMBOLS = ["BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","ADAUSDT","DOGEUSDT"];

const isNum = (v) => Number.isFinite(v);
const showNum = (v, max=6) => isNum(v) ? v.toLocaleString(undefined,{maximumFractionDigits:max}) : "—";
const pct = (n) => isNum(n) ? `${n>0?"+":""}${n.toFixed(2)}%` : "—";

const styles = {
  rowBtn: {
    display:"grid",
    gridTemplateColumns:"3fr 2fr 2fr 2fr 2fr 1fr",
    width:"100%",
    alignItems:"center",
    padding:"10px 12px",
    background:"#0f1320",
    color:"#eef3ff",
    borderTop:"1px solid #141a2a",
    textAlign:"left"
  },
  cellRight: { textAlign:"right" },
  cellCenter: { textAlign:"center" },
  pillLow: { display:"inline-block", padding:"4px 8px", borderRadius:999, border:"1px solid #1f8a5c", color:"#22d39a", background:"rgba(34,211,154,0.08)", fontSize:12, fontWeight:800 },
  pillMed: { display:"inline-block", padding:"4px 8px", borderRadius:999, border:"1px solid #b8860b", color:"#ffcc66", background:"rgba(255,204,102,0.08)", fontSize:12, fontWeight:800 },
  pillHigh:{ display:"inline-block", padding:"4px 8px", borderRadius:999, border:"1px solid #a33a3a", color:"#ff7b7b", background:"rgba(255,107,107,0.08)", fontSize:12, fontWeight:800 },
  stale: { display:"inline-flex", gap:6, alignItems:"center", color:"#ff7b7b", fontSize:11, marginLeft:8 }
};

function buildUrl(symbols){
  const streams = symbols.map(s=>`${s.toLowerCase()}@miniTicker`).join("/");
  return `${WS_BASE}?streams=${streams}`;
}

function classifyRisk(h,l,o){
  if(!isNum(o)||!isNum(h)||!isNum(l)||o<=0) return "LOW";
  const r = Math.abs(h-l)/o;
  if (r>=0.07) return "HIGH";
  if (r>=0.03) return "MEDIUM";
  return "LOW";
}

function FavStar({active, onClick}){
  return (
    <span onClick={onClick} title={active?"Favoriden çıkar":"Favoriye ekle"}
      style={{cursor:"pointer", color: active? "#ffd54a":"#6e7890"}}>
      ★
    </span>
  );
}

export default function RealtimePanel({
  symbols=DEFAULT_SYMBOLS,
  staleAfterMs=5000,
  longShortFetchEveryMs=30000,
  onOpenDetails
}){
  const [tickers, setTickers] = useState({});
  const [status, setStatus] = useState("CONNECTING");
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const lastMsgTs = useRef(0);
  const reconnectAttempt = useRef(0);
  const mounted = useRef(true);

  // favoriler (localStorage guard)
  const [favorites, setFavorites] = useState([]);
  useEffect(()=>{
    if (typeof window==="undefined") return;
    try { setFavorites(JSON.parse(localStorage.getItem("kg-favs")||"[]")); } catch {}
  },[]);
  const toggleFav = (sym)=>{
    if (typeof window==="undefined") return;
    const set = new Set((favorites||[]).map(x=>String(x).toUpperCase()));
    const u = sym.toUpperCase();
    set.has(u) ? set.delete(u) : set.add(u);
    const arr = Array.from(set);
    setFavorites(arr);
    try { localStorage.setItem("kg-favs", JSON.stringify(arr)); } catch {}
  };

  const url = useMemo(()=>buildUrl(symbols), [symbols]);

  const connect = useCallback(()=>{
    if (typeof window==="undefined") return;
    try{
      setStatus("CONNECTING"); setError(null);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = ()=>{ if(!mounted.current) return; setStatus("OPEN"); reconnectAttempt.current = 0; };

      ws.onmessage = (ev)=>{
        lastMsgTs.current = Date.now();
        try{
          const pkt = JSON.parse(ev.data);
          const d = pkt?.data;
          if(!d || typeof d.s!=="string") return;
          const s = d.s.toUpperCase();
          const price = Number(d.c);
          const open = Number(d.o);
          const high = Number(d.h);
          const low  = Number(d.l);
          const volume = Number(d.v);
          const quoteVolume = Number(d.q);

          if (!isNum(price)) return;

          const changePct = (isNum(open)&&open>0) ? ((price-open)/open)*100 : NaN;
          const riskTier = classifyRisk(high,low,open);

          setTickers(prev=>({
            ...prev,
            [s]: {
              symbol:s,
              price,
              open: isNum(open)? open: NaN,
              high: isNum(high)? high: NaN,
              low:  isNum(low) ? low : NaN,
              volume: isNum(volume)? volume: NaN,
              quoteVolume: isNum(quoteVolume)? quoteVolume: NaN,
              changePct: isNum(changePct)? changePct: NaN,
              riskTier,
              longShortRatio: prev[s]?.longShortRatio,
              lastUpdate: Date.now()
            }
          }));
        }catch{}
      };

      ws.onerror = ()=>{ if(!mounted.current) return; setStatus("ERROR"); setError("WebSocket hatası"); };
      ws.onclose  = ()=>{
        if(!mounted.current) return;
        setStatus("CLOSED");
        const n = ++reconnectAttempt.current;
        const base = Math.min(30000, 1000*Math.pow(2,n));
        const jitter = Math.floor(Math.random()*800);
        setTimeout(()=> mounted.current && connect(), base + jitter);
      };
    }catch(e){
      setStatus("ERROR"); setError(e?.message||"Bilinmeyen hata");
    }
  },[url]);

  useEffect(()=>{
    mounted.current = true;
    connect();
    return ()=>{ mounted.current=false; try{ wsRef.current?.close(); }catch{} };
  },[connect]);

  // stale olduğunda yeniden bağlan
  useEffect(()=>{
    const iv = setInterval(()=>{
      if (status==="OPEN" && Date.now()-lastMsgTs.current > Math.max(staleAfterMs*2, 10000)){
        try{ wsRef.current?.close(); }catch{}
      }
    },2000);
    return ()=> clearInterval(iv);
  },[status, staleAfterMs]);

  // Long/Short ratio
  useEffect(()=>{
    let stop=false;
    async function pull(sym){
      try{
        const u = `${REST_BASE}/futures/data/globalLongShortAccountRatio?symbol=${sym}&period=5m&limit=1`;
        const r = await fetch(u);
        if(!r.ok) return;
        const arr = await r.json();
        const last = arr?.[0];
        const ratio = last ? Number(last.longShortRatio) : NaN;
        if (stop || !isNum(ratio)) return;
        setTickers(prev=>({...prev, [sym]: {...prev[sym], longShortRatio: ratio }}));
      }catch{}
    }
    if (typeof window==="undefined") return;
    symbols.forEach((s,i)=> setTimeout(()=>pull(s.toUpperCase()), i*300));
    const iv = setInterval(()=> symbols.forEach((s,i)=> setTimeout(()=>pull(s.toUpperCase()), i*300)), longShortFetchEveryMs);
    return ()=>{ stop=true; clearInterval(iv); };
  },[symbols, longShortFetchEveryMs]);

  // sıralama: favori ↑, ardından mutlak % değişim
  const favSet = useMemo(()=> new Set((favorites||[]).map(x=>String(x).toUpperCase())),[favorites]);
  const list = useMemo(()=>{
    const arr = Object.values(tickers);
    return arr.sort((a,b)=>{
      const af = favSet.has(a.symbol)?1:0, bf = favSet.has(b.symbol)?1:0;
      if (af!==bf) return bf-af;
      const aa = isNum(a.changePct)? Math.abs(a.changePct) : -1;
      const bb = isNum(b.changePct)? Math.abs(b.changePct) : -1;
      return bb-aa;
    });
  },[tickers, favSet]);

  const isStale = (t)=> Date.now()-t.lastUpdate > staleAfterMs;

  return (
    <div>
      {/* status satırı */}
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 12px", background:"#0f1320", color:"#aab3c5"}}>
        <div style={{display:"flex", alignItems:"center", gap:8}}>
          <span style={{
            display:"inline-block", width:8, height:8, borderRadius:999,
            background: status==="OPEN" ? "#22d39a" : status==="CONNECTING" ? "#ffcc66" : status==="ERROR" ? "#ff6b6b" : "#6e7890"
          }}/>
          <span style={{fontWeight:800}}>
            WebSocket: {status==="OPEN"?"Canlı":status==="CONNECTING"?"Bağlanıyor":status==="ERROR"?"Hata":"Kapalı"}
          </span>
          {error && <span style={{color:"#ff7b7b"}}>• {error}</span>}
        </div>
        <div style={{fontSize:12, opacity:.8}}>Kaynak: Binance Futures (miniTicker)</div>
      </div>

      {/* satırlar */}
      <div>
        {list.map(t=>{
          const cp = isNum(t.changePct) ? t.changePct : 0;
          const risk = t.riskTier||"LOW";
          const pill = risk==="HIGH" ? styles.pillHigh : risk==="MEDIUM" ? styles.pillMed : styles.pillLow;
          return (
            <button key={t.symbol} onClick={()=> onOpenDetails && onOpenDetails(t.symbol)}
              style={{...styles.rowBtn, cursor:"pointer"}}
              onMouseEnter={e=> e.currentTarget.style.background="#12172a"}
              onMouseLeave={e=> e.currentTarget.style.background="#0f1320"}
            >
              <div style={{display:"flex", alignItems:"center", gap:8}}>
                <span style={{fontWeight:900, letterSpacing:.3}}>{t.symbol}</span>
                {isStale(t) && (
                  <span style={styles.stale}>
                    <span style={{width:6, height:6, borderRadius:999, background:"#ff5d5d", display:"inline-block"}}/>
                    Eski veri
                  </span>
                )}
              </div>

              <div style={{...styles.cellRight, fontVariantNumeric:"tabular-nums"}}>{showNum(t.price, 6)}</div>

              <div style={styles.cellRight}>
                <span style={{fontWeight:900, color: cp>0 ? "#22d39a" : cp<0 ? "#ff7b7b" : "#c9d3e7"}}>
                  {pct(t.changePct)}
                </span>
              </div>

              <div style={styles.cellCenter}>
                <span style={pill}>{risk==="HIGH"?"Yüksek":risk==="MEDIUM"?"Orta":"Düşük"}</span>
              </div>

              <div style={styles.cellCenter}>
                {isNum(t.longShortRatio)
                  ? <span style={{fontWeight:900, color: t.longShortRatio>=1 ? "#22d39a" : "#ff7b7b"}}>{t.longShortRatio.toFixed(2)}x</span>
                  : <span style={{opacity:.6}}>—</span>}
              </div>

              <div style={{...styles.cellCenter}}>
                <FavStar active={favSet.has(t.symbol)} onClick={(e)=>{ e.stopPropagation(); toggleFav(t.symbol); }}/>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}







