// pages/index.js
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/* ================== Sabitler ================== */
const DEFAULTS = ["BTCUSDT","ETHUSDT","BNBUSDT"];
const ALL_TFS  = ["1m","3m","5m","15m","30m","1h","2h","3h","4h","12h","1d","3d"];
const WHALE_MIN_USD = 200000; // ≥ $200k

/* ================== Util ================== */
const fmt = (v,d=2)=> (v==null||isNaN(v)) ? "—" :
  Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d, maximumFractionDigits:d});
const fmtPrice = (v)=>{
  if (v==null || isNaN(v)) return "—";
  const a = Math.abs(v);
  const d = a>=100?2 : a>=1?4 : 6;
  return Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d, maximumFractionDigits:d});
};
const clamp = (x,min,max)=> Math.max(min, Math.min(max,x));

function biasFromLatest(L){
  if(!L) return { longPct:50, shortPct:50 };
  const close=L.close, ema=L.ema20, rsi=L.rsi14, k=L.stochK, d=L.stochD, bu=L.bbUpper, bl=L.bbLower;
  const emaDist = (close!=null && ema!=null) ? ((close-ema)/ema*100) : null;
  const kCross  = (k!=null && d!=null) ? (k-d) : null;
  const bandPos = (bu!=null && bl!=null && close!=null) ? ((close-bl)/(bu-bl)*100) : null;
  const nEMA   = emaDist==null ? 0 : clamp(emaDist/3, -1, 1);
  const nRSI   = rsi==null ? 0 : clamp((rsi-50)/25, -1, 1);
  const nKxD   = kCross==null ? 0 : clamp(kCross/50, -1, 1);
  const nBand  = bandPos==null ? 0 : clamp((bandPos-50)/30, -1, 1);
  const score = 0.35*nEMA + 0.30*nRSI + 0.20*nKxD + 0.15*nBand;
  const longPct = Math.round(((score+1)/2)*100);
  return { longPct, shortPct: 100-longPct };
}

/* ================== WS Helper (sağlam) ==================
   - createWs({url, onMessage})
   - Heartbeat (ping), auto-reconnect (exponential backoff),
   - Kapandığında tekrar bağlanır; dışarıya status set eder.
========================================================== */
function createWs({ url, onMessage, onStatus }) {
  let ws = null, alive = false, hbTimer = null, backoff = 1000;

  const open = () => {
    try {
      ws = new WebSocket(url);
      onStatus?.("connecting");
      ws.onopen = () => {
        alive = true;
        onStatus?.("open");
        backoff = 1000;
        // heartbeat
        clearInterval(hbTimer);
        hbTimer = setInterval(() => {
          try {
            if (!ws || ws.readyState !== 1) return;
            // Binance multiplex’te ping gerekmese de “noop” gönderip canlı tutuyoruz
            ws.send(JSON.stringify({method:"PING", ts:Date.now()}));
          } catch {}
        }, 20000);
      };
      ws.onmessage = (ev) => {
        try { onMessage?.(ev); } catch {}
      };
      ws.onerror = () => {
        onStatus?.("error");
      };
      ws.onclose = () => {
        onStatus?.("closed");
        alive = false;
        clearInterval(hbTimer);
        // auto-reconnect
        setTimeout(() => { backoff = Math.min(backoff*1.5, 15000); open(); }, backoff);
      };
    } catch (e) {
      onStatus?.("error");
      setTimeout(() => { backoff = Math.min(backoff*1.5, 15000); open(); }, backoff);
    }
  };
  open();
  return {
    close: () => { try { clearInterval(hbTimer); ws && ws.close(); } catch {} },
    get ready() { return alive; }
  };
}

/* ================== Sayfa ================== */
export default function Home() {
  const [symbols, setSymbols] = useState(DEFAULTS);
  const [interval, setIntervalStr] = useState("1m");
  const [rows, setRows] = useState({});
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const timer = useRef(null);

  // Arama
  const [q, setQ] = useState("");
  const [otherSym, setOtherSym] = useState(null);

  // WS durumları (UI debug)
  const [miniStatus, setMiniStatus] = useState("—");
  const [btcStatus, setBtcStatus]   = useState("—");
  const [ethStatus, setEthStatus]   = useState("—");
  const [othStatus, setOthStatus]   = useState("—");

  /* ===== miniTicker WS (BTC/ETH/BNB) ===== */
  const [tickers, setTickers] = useState({});
  useEffect(()=>{
    const list = DEFAULTS.map(s => s.toLowerCase()+"@miniTicker").join("/");
    const url = `wss://fstream.binance.com/stream?streams=${list}`;

    const ws = createWs({
      url,
      onStatus: setMiniStatus,
      onMessage: (ev) => {
        try{
          const payload = JSON.parse(ev.data);
          const d = payload?.data;
          if(d?.e==="24hrMiniTicker"){
            setTickers(prev => ({ ...prev, [d.s]: { last:+d.c, pct:+d.P } }));
          }
        }catch{}
      }
    });

    return ()=> ws.close();
  }, []);

  /* ===== Whale WS: BTC & ETH sabit ===== */
  const [btcFlows,setBtcFlows]=useState([]); 
  const [ethFlows,setEthFlows]=useState([]);
  useEffect(()=>{
    const make = (sym,setter,setStatus)=>{
      const url=`wss://fstream.binance.com/stream?streams=${sym.toLowerCase()}@aggTrade`;
      return createWs({
        url,
        onStatus: setStatus,
        onMessage: (ev)=>{
          try{
            const payload = JSON.parse(ev.data);
            const d=payload?.data; if(!d) return;
            const price=+d.p, qty=+d.q, usd=price*qty;
            if(usd>=WHALE_MIN_USD){
              // m: true -> seller is maker → genelde satış yönü
              const side = d.m ? "SELL" : "BUY";
              setter(arr=>[{t:Date.now(), side, price, qty, usd}, ...arr].slice(0,50));
            }
          }catch{}
        }
      });
    };
    const w1=make("BTCUSDT",setBtcFlows,setBtcStatus);
    const w2=make("ETHUSDT",setEthFlows,setEthStatus);
    return ()=>{ w1.close(); w2.close(); };
  },[]);

  /* ===== Whale WS: Aranan coin dinamik ===== */
  const [othFlows,setOthFlows]=useState([]);
  const othRef = useRef(null);
  useEffect(()=>{
    // önce eski ws’i kapat
    if(othRef.current){ othRef.current.close(); othRef.current=null; }
    setOthFlows([]); setOthStatus(otherSym ? "connecting" : "—");
    if(!otherSym) return;

    const url=`wss://fstream.binance.com/stream?streams=${otherSym.toLowerCase()}@aggTrade`;
    const ws = createWs({
      url,
      onStatus: setOthStatus,
      onMessage: (ev)=>{
        try{
          const payload = JSON.parse(ev.data);
          const d=payload?.data; if(!d) return;
          const price=+d.p, qty=+d.q, usd=price*qty;
          if(usd>=WHALE_MIN_USD){
            const side = d.m ? "SELL" : "BUY";
            setOthFlows(arr=>[{t:Date.now(), side, price, qty, usd}, ...arr].slice(0,50));
          }
        }catch{}
      }
    });
    othRef.current = ws;
    return ()=> { try{ ws.close(); }catch{} };
  }, [otherSym]);

  /* ===== REST indikatör fetch (9sn) ===== */
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
      const map={}; symbols.forEach((sym,i)=> map[sym]=res[i]);
      setRows(map);
    } finally { setLoading(false); }
  }
  useEffect(()=>{ load(); }, [interval, symbols]);
  useEffect(()=>{
    if (timer.current) clearInterval(timer.current);
    if (auto) timer.current = setInterval(load, 9000); // 9 sn
    return ()=> clearInterval(timer.current);
  }, [auto, interval, symbols]);

  /* ===== Arama ===== */
  function onSearch(){
    if(!q) return;
    const s = q.trim().toUpperCase(); if(!s) return;
    const sym = s.endsWith("USDT") ? s : (s + "USDT");
    setSymbols([sym]);
    setOtherSym(sym); // balina akışını da aç
  }
  function onReset(){
    setSymbols(DEFAULTS);
    setQ("");
    setOtherSym(null);
  }

  return (
    <main style={{padding:"16px 18px"}}>
      {/* Üst bar (sayfa içi) */}
      <div style={{display:"flex", gap:12, alignItems:"center", marginBottom:12, flexWrap:"wrap"}}>
        <h1 style={{margin:0, fontSize:20}}>KriptoGözÜ • Genel Panel</h1>
        <span style={{opacity:.7}}>(kartlarda özet • detay için tıkla)</span>

        <select value={interval} onChange={e=>setIntervalStr(e.target.value)}
          style={{padding:"8px 10px", background:"#121625", border:"1px solid #23283b", borderRadius:10, color:"#e6e6e6", marginLeft:10}}>
          {ALL_TFS.map(x=><option key={x} value={x}>{x}</option>)}
        </select>

        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="BTC, ETH, SOL…"
               style={{padding:"8px 10px", background:"#121625", border:"1px solid #23283b", borderRadius:10, color:"#e6e6e6"}}/>
        <button onClick={onSearch} style={btn}>Ara</button>

        <button onClick={onReset} style={btn}>Sıfırla</button>
        <button onClick={load} disabled={loading} style={btn}>
          {loading? "Yükleniyor…" : "Yenile"}
        </button>

        <label style={{marginLeft:8, display:"flex", alignItems:"center", gap:8}}>
          <input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/>
          9 sn’de bir otomatik yenile
        </label>
      </div>

      {/* miniTicker WS özet */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:8, marginBottom:12}}>
        {DEFAULTS.map(sym=>{
          const t = tickers[sym] || {};
          const col = t.pct==null ? "#9aa4b2" : (t.pct>=0 ? "#22d39a" : "#ff6b6b");
          return (
            <div key={sym} style={{background:"#121a33", border:"1px solid #202945", borderRadius:10, padding:10}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                <b style={{color:"#8bd4ff"}}>{sym}</b>
                <span style={{color:col, fontWeight:800}}>
                  {t.pct==null? "—" : (t.pct>=0?"+":"")+fmt(t.pct,2)+"%"}
                </span>
              </div>
              <div style={{opacity:.85, marginTop:6}}>Son Fiyat: <b>{fmtPrice(t.last)}</b></div>
            </div>
          );
        })}
      </div>

      {/* Balina Akışları (WS) */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:10, marginBottom:12}}>
        <WhaleCard title="BTC Whale (≥ $200k)" data={btcFlows} status={btcStatus}/>
        <WhaleCard title="ETH Whale (≥ $200k)" data={ethFlows} status={ethStatus}/>
        {otherSym && <WhaleCard title={`${otherSym} Whale (≥ $200k)`} data={othFlows} status={othStatus}/>}
      </div>

      {/* Kartlar (REST + WS ile güncellenen bias) */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))", gap:12}}>
        {symbols.map(sym => <CoinCard key={sym} sym={sym} row={rows[sym]} />)}
      </div>

      {/* WS durum mini göstergesi */}
      <div style={{position:"fixed", right:10, bottom:10, fontSize:12, opacity:.8, background:"#111730",
                   border:"1px solid #223054", borderRadius:8, padding:"6px 8px"}}>
        miniTicker: <b>{miniStatus}</b> • btc: <b>{btcStatus}</b> • eth: <b>{ethStatus}</b> {otherSym? <>• {otherSym}: <b>{othStatus}</b></> : null}
      </div>
    </main>
  );
}

/* ================== UI Bileşenleri ================== */
function CoinCard({ sym, row }) {
  const L = row?.latest || {};
  const close = L?.close;

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

function WhaleCard({ title, data, status }){
  return (
    <div style={{background:"#121a33", border:"1px solid #202945", borderRadius:10, padding:10}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6}}>
        <div style={{fontWeight:800, color:"#9bd0ff"}}>{title}</div>
        <div style={{fontSize:12, opacity:.75}}>WS: {status}</div>
      </div>
      <div style={{maxHeight:220, overflowY:"auto"}}>
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
