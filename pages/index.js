// pages/index.js
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const DEFAULTS = ["BTCUSDT","ETHUSDT","BNBUSDT"];

const fmtPrice = (v)=>{
  if (v==null || isNaN(v)) return "—";
  const a = Math.abs(v);
  const d = a >= 100 ? 2 : a >= 1 ? 4 : 6;
  return Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d, maximumFractionDigits:d});
};
const fmt = (v,d=2)=> (v==null||isNaN(v)) ? "—" :
  Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d, maximumFractionDigits:d});
const clamp = (x,min,max)=> Math.max(min, Math.min(max,x));

function biasFromLatest(L){
  if(!L) return { longPct:50, shortPct:50, score:0 };
  const close=L.close, ema=L.ema20, rsi=L.rsi14, k=L.stochK, d=L.stochD, bu=L.bbUpper, bl=L.bbLower;
  const emaDist = (close!=null && ema!=null) ? ((close-ema)/ema*100) : null;
  const kCross  = (k!=null && d!=null) ? (k-d) : null;
  const bandPos = (bu!=null && bl!=null && close!=null) ? ((close-bl)/(bu-bl)*100) : null;
  const nEMA   = emaDist==null ? 0 : clamp(emaDist/3, -1, 1);
  const nRSI   = rsi==null ? 0 : clamp((rsi-50)/25, -1, 1);
  const nKxD   = kCross==null ? 0 : clamp(kCross/50, -1, 1);
  const nBand  = bandPos==null ? 0 : clamp((bandPos-50)/30, -1, 1);
  const wEMA=0.35, wRSI=0.30, wKxD=0.20, wBand=0.15;
  const score = (wEMA*nEMA + wRSI*nRSI + wKxD*nKxD + wBand*nBand);
  const longPct = Math.round( (score+1)/2 * 100 );
  const shortPct = 100 - longPct;
  return { longPct, shortPct, score };
}

export default function Home() {
  const [symbols, setSymbols] = useState(DEFAULTS);
  const [interval, setIntervalStr] = useState("1m");
  const [rows, setRows] = useState({});
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const timer = useRef(null);

  // Arama
  const [q, setQ] = useState("");

  // BTC/ETH Whale özet (≥ 200k USD, son 10 adet)
  const [btcFlows,setBtcFlows]=useState([]); const [ethFlows,setEthFlows]=useState([]);
  useEffect(()=>{
    const make = (sym,setter)=>{
      const url=`wss://fstream.binance.com/stream?streams=${sym.toLowerCase()}@aggTrade`;
      const ws = new WebSocket(url); let lastP=null;
      ws.onmessage = (ev)=>{
        try{
          const d=JSON.parse(ev.data)?.data; if(!d) return;
          const price=+d.p, qty=+d.q, usd=price*qty;
          if(usd>=200000){
            let side = d.m ? "SELL" : "BUY";
            if(lastP!=null && price>lastP) side="BUY";
            if(lastP!=null && price<lastP) side="SELL";
            lastP=price;
            setter(arr=>[{t:Date.now(), side, price, qty, usd}, ...arr].slice(0,10));
          }
        }catch{}
      };
      return ws;
    };
    const w1=make("BTCUSDT",setBtcFlows);
    const w2=make("ETHUSDT",setEthFlows);
    return ()=>{ try{w1.close();}catch{} try{w2.close();}catch{} };
  },[]);

  async function load() {
    try {
      setLoading(true);
      const res = await Promise.all(
        symbols.map(sym =>
          fetch(`/api/futures/indicators?symbol=${sym}&interval=${interval}&limit=300`, { cache:"no-store" })
            .then(r=>r.json())
            .catch(()=>null)
        )
      );
      const map = {};
      symbols.forEach((sym, i)=> map[sym] = res[i]);
      setRows(map);
    } finally { setLoading(false); }
  }

  useEffect(()=>{ load(); }, [interval, symbols]);
  useEffect(()=>{
    if (timer.current) clearInterval(timer.current);
    if (auto) timer.current = setInterval(load, 9000);
    return ()=> clearInterval(timer.current);
  }, [auto, interval, symbols]);

  function onSearch(){
    if(!q) return;
    const s = q.toUpperCase().endsWith("USDT") ? q.toUpperCase() : (q.toUpperCase()+"USDT");
    setSymbols([s]);
  }
  function onReset(){ setSymbols(DEFAULTS); setQ(""); }

  return (
    <main style={{padding:"16px 18px"}}>
      <div style={{display:"flex", gap:12, alignItems:"center", marginBottom:12, flexWrap:"wrap"}}>
        <h1 style={{margin:0, fontSize:20}}>KriptoGözÜ • Genel Panel</h1>
        <span style={{opacity:.7}}>(kartlarda özet • detay için tıkla)</span>

        <select value={interval} onChange={e=>setIntervalStr(e.target.value)}
          style={{padding:"8px 10px", background:"#121625", border:"1px solid #23283b", borderRadius:10, color:"#e6e6e6", marginLeft:10}}>
          {["1m","3m","5m","15m","30m","1h","2h","3h","4h","12h","1d","3d"].map(x=><option key={x} value={x}>{x}</option>)}
        </select>

        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="BTC, ETH, SOL…"
               style={{padding:"8px 10px", background:"#121625", border:"1px solid #23283b", borderRadius:10, color:"#e6e6e6"}}/>
        <button onClick={onSearch} style={btn}>Ara</button>

        <button onClick={onReset} className="btn" style={btn}>Sıfırla</button>
        <button onClick={load} disabled={loading} style={btn}>
          {loading? "Yükleniyor…" : "Yenile"}
        </button>

        <label style={{marginLeft:8, display:"flex", alignItems:"center", gap:8}}>
          <input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/>
          9 sn’de bir otomatik yenile
        </label>
      </div>

      {/* BTC/ETH Balina özet */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:10, marginBottom:12}}>
        <WhaleCard title="BTC Whale (≥$200k)" data={btcFlows}/>
        <WhaleCard title="ETH Whale (≥$200k)" data={ethFlows}/>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))", gap:12}}>
        {symbols.map(sym => <CoinCard key={sym} sym={sym} row={rows[sym]} />)}
      </div>
    </main>
  );
}

function CoinCard({ sym, row }) {
  const L = row?.latest || {};
  const close = L.close;

  const { longPct, shortPct } = biasFromLatest(L);
  const signal = longPct >= 55 ? "LONG" : shortPct >= 55 ? "SHORT" : "NÖTR";
  const color  = signal === "LONG" ? "#20c997" : signal === "SHORT" ? "#ff6b6b" : "#89a";
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
        minHeight:100
      }}>
        <div style={{display:"grid", gap:4}}>
          <div style={{fontWeight:800, fontSize:18, color:"#8bd4ff"}}>{sym}</div>
          <div style={{opacity:.85}}>Son Fiyat: <b>{fmtPrice(close)}</b></div>
          <div style={{opacity:.9, marginTop:4}}>
            <span style={{color:"#20c997", fontWeight:700}}>Long {fmt(longPct,0)}%</span>
            <span style={{opacity:.7}}> / </span>
            <span style={{color:"#ff6b6b", fontWeight:700}}>Short {fmt(shortPct,0)}%</span>
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontWeight:800, color}}>{signal}</div>
          <div style={{opacity:.6, fontSize:12, marginTop:6}}>Tıkla → detay</div>
        </div>
      </div>
    </Link>
  );
}

function WhaleCard({ title, data }){
  return (
    <div style={{background:"#121a33", border:"1px solid #202945", borderRadius:10, padding:10}}>
      <div style={{fontWeight:800, color:"#9bd0ff", marginBottom:6}}>{title}</div>
      <div style={{maxHeight:180, overflowY:"auto"}}>
        {(!data || data.length===0) && <div style={{opacity:.7}}>Henüz akış yok…</div>}
        {data.map((it,idx)=>(
          <div key={idx} style={{display:"grid",gridTemplateColumns:"76px 1fr 1fr",gap:8,padding:"6px 0",borderTop:"1px solid #1f2742"}}>
            <div style={{opacity:.7}}>{new Date(it.t).toLocaleTimeString("tr-TR")}</div>
            <div style={{fontWeight:800, color: it.side==="BUY"?"#22d39a":"#ff6b6b"}}>{it.side}</div>
            <div style={{textAlign:"right"}}>{fmtPrice(it.price)} • ${fmt(it.usd,0)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const btn = {padding:"8px 12px", background:"#1a1f2e", border:"1px solid #2a2f45", borderRadius:10, color:"#fff", fontWeight:700, cursor:"pointer"};
