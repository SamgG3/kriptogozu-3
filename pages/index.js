// pages/index.js
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const CORE = ["BTCUSDT","ETHUSDT","BNBUSDT"];
const ALL_TFS = ["1m","3m","5m","15m","30m","1h","2h","3h","4h","12h","1d","3d"];

const fmt = (v,d=2)=> v==null||isNaN(v) ? "—" :
  Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d, maximumFractionDigits:d});
const fmtPrice = (v)=> {
  if (v==null||isNaN(v)) return "—";
  const a = Math.abs(v);
  const d = a>=100?2:a>=1?4:6;
  return Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d, maximumFractionDigits:d});
};

export default function Home(){
  const [symbols, setSymbols] = useState(CORE);
  const [interval, setIntervalStr] = useState("1m");
  const [rows, setRows] = useState({});
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const timer = useRef(null);

  // 24h değişim ve miniTicker için WS (BTC,ETH,BNB)
  const [tickers, setTickers] = useState({});
  useEffect(()=>{
    const list = CORE.map(s => s.toLowerCase()+"@miniTicker").join("/");
    const url = `wss://fstream.binance.com/stream?streams=${list}`;
    const ws = new WebSocket(url);
    ws.onmessage = (ev)=>{
      try{
        const d = JSON.parse(ev.data)?.data;
        if(d?.e==="24hrMiniTicker"){
          setTickers(prev=>({
            ...prev,
            [d.s]: { last:+d.c, pct:+d.P } // P: 24h %
          }));
        }
      }catch{}
    };
    return ()=>{ try{ws.close();}catch{} };
  }, []);

  async function load(){
    try{
      setLoading(true);
      const res = await Promise.all(
        symbols.map(sym =>
          fetch(`/api/futures/indicators?symbol=${sym}&interval=${interval}&limit=300`, { cache:"no-store" })
            .then(r=>r.json()).catch(()=>null)
        )
      );
      const map={}; symbols.forEach((sym,i)=> map[sym]=res[i]);
      setRows(map);
    } finally { setLoading(false); }
  }

  useEffect(()=>{ load(); }, [interval, symbols]);
  useEffect(()=>{
    if (timer.current) clearInterval(timer.current);
    if (auto) timer.current = setInterval(load, 9000); // ana sayfa 9s
    return ()=> clearInterval(timer.current);
  }, [auto, interval, symbols]);

  function resetToCore(){
    setSymbols(CORE);
  }

  return (
    <main style={{padding:"16px 18px"}}>
      <div style={{display:"flex", gap:12, alignItems:"center", marginBottom:12, flexWrap:"wrap"}}>
        <h1 style={{margin:0, fontSize:20}}>KriptoGözÜ • Genel Panel</h1>
        <span style={{opacity:.7}}>(kartlarda özet • detay için tıkla)</span>

        <select value={interval} onChange={e=>setIntervalStr(e.target.value)}
          style={{padding:"8px 10px", background:"#121625", border:"1px solid #23283b", borderRadius:10, color:"#e6e6e6", marginLeft:10}}>
          {ALL_TFS.map(x=><option key={x} value={x}>{x}</option>)}
        </select>

        <button onClick={resetToCore}
          style={{padding:"8px 12px", background:"#1a1f2e", border:"1px solid #2a2f45", borderRadius:10, color:"#fff", fontWeight:700}}>
          Sıfırla
        </button>
        <button onClick={load} disabled={loading}
          style={{padding:"8px 12px", background:"#1a1f2e", border:"1px solid #2a2f45", borderRadius:10, color:"#fff", fontWeight:700}}>
          {loading? "Yükleniyor…" : "Yenile"}
        </button>

        <label style={{marginLeft:8, display:"flex", alignItems:"center", gap:8}}>
          <input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/>
          9 sn’de bir otomatik yenile
        </label>
      </div>

      {/* Üst 3lü miniTicker */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:8, marginBottom:12}}>
        {CORE.map(sym=>{
          const t = tickers[sym] || {};
          const col = t.pct==null ? "#9aa4b2" : (t.pct>=0 ? "#22d39a" : "#ff6b6b");
          return (
            <div key={sym} style={{background:"#121a33", border:"1px solid #202945", borderRadius:10, padding:10}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                <b style={{color:"#8bd4ff"}}>{sym}</b>
                <span style={{color:col, fontWeight:800}}>{t.pct==null? "—" : (t.pct>=0?"+":"")+fmt(t.pct,2)+"%"}</span>
              </div>
              <div style={{opacity:.85, marginTop:6}}>Son Fiyat: <b>{fmtPrice(t.last)}</b></div>
            </div>
          );
        })}
      </div>

      {/* Kartlar */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))", gap:12}}>
        {symbols.map(sym => <CoinCard key={sym} sym={sym} row={rows[sym]} />)}
      </div>
    </main>
  );
}

function CoinCard({ sym, row }){
  const L = row?.latest || {};
  const close = L.close;
  // basit önyüz sinyali (EMA20/RSI)
  const ema = L.ema20, rsi=L.rsi14;
  const long = (close>ema) && (rsi>50);
  const short = (close<ema) && (rsi<50);
  const signal = long? "LONG" : short? "SHORT" : "NÖTR";
  const color  = signal === "LONG" ? "#22d39a" : signal === "SHORT" ? "#ff6b6b" : "#9aa4b2";
  const border = signal === "LONG" ? "#1f7a4f" : signal === "SHORT" ? "#7a2e2e" : "#2a2f45";

  return (
    <Link href={`/coin/${sym}`} style={{ textDecoration:"none" }}>
      <div style={{
        background:"#151a2b",
        border:`1px solid ${border}`,
        borderRadius:12,
        padding:14,
        display:"grid",
        gridTemplateColumns:"1fr auto",
        alignItems:"center",
        gap:10,
        minHeight:86
      }}>
        <div style={{display:"grid", gap:4}}>
          <div style={{fontWeight:800, fontSize:18, color:"#8bd4ff"}}>{sym}</div>
          <div style={{opacity:.85}}>Son Fiyat: <b>{fmtPrice(close)}</b></div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontWeight:800, color}}>{signal}</div>
          <div style={{opacity:.6, fontSize:12, marginTop:6}}>Tıkla → detay</div>
        </div>
      </div>
    </Link>
  );
}
