// pages/coin/[symbol].js
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

/* ===== Helpers ===== */
const fmt = (v, d = 2) => v==null||isNaN(v) ? "—" :
  Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d, maximumFractionDigits:d});
const fmtPrice = (v)=>{ if(v==null||isNaN(v)) return "—"; const a=Math.abs(v); const d=a>=100?2:a>=1?4:6;
  return Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d, maximumFractionDigits:d}); };
const clamp = (x,min,max)=> Math.max(min, Math.min(max,x));

/* ===== Core indicators ===== */
const SMA=(arr,p)=>{ const n=arr?.length||0, out=new Array(n).fill(null); if(!arr||n<p) return out;
  let s=0; for(let i=0;i<n;i++){ s+=arr[i]; if(i>=p) s-=arr[i-p]; if(i>=p-1) out[i]=s/p; } return out; };
const EMA=(arr,p)=>{ const n=arr?.length||0, out=new Array(n).fill(null); if(!arr||n<p) return out;
  const k=2/(p+1); let prev=arr[0]; for(let i=0;i<n;i++){ const v=arr[i]; prev=i===0?v:v*k+prev*(1-k); out[i]=i<p-1?null:prev; } return out; };
const RSI=(cl,p=14)=>{ const n=cl?.length||0, out=new Array(n).fill(null); if(!cl||n<p+1) return out;
  let g=0,l=0; for(let i=1;i<=p;i++){ const ch=cl[i]-cl[i-1]; if(ch>=0) g+=ch; else l-=ch; } g/=p; l/=p; out[p]=100-100/(1+(l===0?Infinity:g/l));
  for(let i=p+1;i<n;i++){ const ch=cl[i]-cl[i-1]; const gg=ch>0?ch:0, ll=ch<0?-ch:0; g=(g*(p-1)+gg)/p; l=(l*(p-1)+ll)/p;
    out[i]=100-100/(1+(l===0?Infinity:g/l)); } return out; };
const Stoch=(hi,lo,cl,kP=14,dP=3)=>{ const n=cl?.length||0, K=new Array(n).fill(null), D=new Array(n).fill(null);
  if(!hi||!lo||!cl||n<kP) return {K,D}; for(let i=kP-1;i<n;i++){ let h=-Infinity,l=Infinity;
    for(let j=i-kP+1;j<=i;j++){ if(hi[j]>h) h=hi[j]; if(lo[j]<l) l=lo[j]; } K[i]=h===l?50:((cl[i]-l)/(h-l))*100; }
  for(let i=0;i<n;i++){ let s=0,c=0; for(let j=i-dP+1;j<=i;j++){ if(j>=0&&K[j]!=null){ s+=K[j]; c++; } } D[i]=c?s/c:null; } return {K,D}; };
const Boll=(cl,p=20,m=2)=>{ const n=cl?.length||0, mid=SMA(cl,p), up=new Array(n).fill(null), low=new Array(n).fill(null);
  for(let i=p-1;i<n;i++){ let s2=0; for(let j=i-p+1;j<=i;j++) s2+=Math.pow(cl[j]-mid[i],2); const sd=Math.sqrt(s2/p); up[i]=mid[i]+m*sd; low[i]=mid[i]-m*sd; }
  return {mid,up,low}; };
const MACD=(cl,f=12,s=26,sig=9)=>{ const fast=EMA(cl,f), slow=EMA(cl,s), n=cl?.length||0; const macd=new Array(n).fill(null);
  for(let i=0;i<n;i++) macd[i]=fast[i]!=null&&slow[i]!=null?fast[i]-slow[i]:null;
  const signal=EMA(macd.map(v=>v??0),sig).map((v,i)=> macd[i]==null?null:v);
  const hist=macd.map((v,i)=> v==null||signal[i]==null?null: v-signal[i]); return {macd,signal,hist}; };
const ATR=(hi,lo,cl,p=14)=>{ const n=cl?.length||0, out=new Array(n).fill(null); if(!hi||!lo||!cl||n<2) return out;
  const tr=new Array(n).fill(0); for(let i=1;i<n;i++){ const a=hi[i]-lo[i], b=Math.abs(hi[i]-cl[i-1]), c=Math.abs(lo[i]-cl[i-1]); tr[i]=Math.max(a,b,c); }
  let s=0; for(let i=1;i<=p;i++) s+=tr[i]; out[p]=s/p; for(let i=p+1;i<n;i++) out[i]=(out[i-1]*(p-1)+tr[i])/p; return out; };
const StochRSI=(cl,rp=14,kp=14,dp=3)=>{ const r=RSI(cl,rp); const n=r.length; const K=new Array(n).fill(null), D=new Array(n).fill(null);
  for(let i=kp;i<n;i++){ const win=r.slice(i-kp+1,i+1).filter(x=>x!=null); if(win.length<kp){ K[i]=null; continue; }
    const mn=Math.min(...win), mx=Math.max(...win); K[i]=mx===mn?50:((r[i]-mn)/(mx-mn))*100; }
  for(let i=0;i<n;i++){ let s=0,c=0; for(let j=i-dp+1;j<=i;j++){ if(j>=0&&K[j]!=null){ s+=K[j]; c++; } } D[i]=c?s/c:null; } return {K,D}; };

/* ===== SR & Trend ===== */
const swingsFromCloses=(cl,look=3)=>{ const highs=[],lows=[]; for(let i=look;i<cl.length-look;i++){
  const w=cl.slice(i-look,i+look+1); const hi=Math.max(...w), lo=Math.min(...w);
  if(cl[i]===hi) highs.push({i,v:hi}); if(cl[i]===lo) lows.push({i,v:lo}); } return {highs,lows}; };
const trendEval=(closes)=>{ if(!closes||closes.length<22) return "—";
  const e20=EMA(closes,20); const c=closes.at(-1), e=e20.at(-1), ep=e20.at(-2);
  if([c,e,ep].some(x=>x==null)) return "—"; const slope=e-ep;
  if(c>e && slope>=0) return "LONG";
  if(c<e && slope<=0) return "SHORT";
  return "—";
};
const longShortPct=(close,ema20,rsi,stK,stD,bbU,bbL)=>{ const emaDist=(close!=null&&ema20!=null)?((close-ema20)/ema20)*100:null;
  const kx=stK!=null&&stD!=null?(stK-stD):null; const bandPos=(bbU!=null&&bbL!=null&&close!=null)?((close-bbL)/(bbU-bbL))*100:null;
  const nEMA=emaDist==null?0:clamp(emaDist/3,-1,1), nRSI=rsi==null?0:clamp((rsi-50)/25,-1,1), nKxD=kx==null?0:clamp(kx/50,-1,1), nBand=bandPos==null?0:clamp((bandPos-50)/30,-1,1);
  const score=0.35*nEMA+0.30*nRSI+0.20*nKxD+0.15*nBand; const longPct=Math.round(((score+1)/2)*100); return { longPct, shortPct:100-longPct }; };

export default function CoinDetail(){
  const router = useRouter();
  const raw = router.query.symbol;
  const symbol = useMemo(()=>{
    if(!raw) return null; const s=String(raw).toUpperCase(); return s.endsWith("USDT")?s:(s+"USDT");
  }, [raw]);

  const TREND_TFS = ["1m","3m","5m","15m","30m","1h","4h","1d","3d"];
  const [interval, setIntervalStr] = useState("1m");
  const [main, setMain] = useState(null);
  const [ind, setInd] = useState(null);
  const [trendMap, setTrendMap] = useState({});
  const [biasMap, setBiasMap] = useState({});
  const [flows, setFlows] = useState([]);
  const [flowMin, setFlowMin] = useState(100000); // 100k / 500k / 1M+
  const [tick, setTick] = useState({ last:null, chg:null });
  const [fav, setFav] = useState(()=> {
    try{ const a=JSON.parse(localStorage.getItem("favSymbols")||"[]"); return a.includes(symbol); }catch{return false;}
  });
  const priceWS = useRef(null); const flowWS = useRef(null);

  // fav init on symbol change
  useEffect(()=>{
    try{ const a=JSON.parse(localStorage.getItem("favSymbols")||"[]"); setFav(a.includes(symbol)); }catch{}
  }, [symbol]);

  async function fromBackend(sym,intv,limit=300){
    const r = await fetch(`/api/futures/indicators?symbol=${sym}&interval=${intv}&limit=${limit}`,{cache:"no-store"});
    const j = await r.json();
    if (Array.isArray(j?.candles) && j.candles.length){
      const H=j.candles.map(c=>+c.high), L=j.candles.map(c=>+c.low), C=j.candles.map(c=>+c.close), V=j.candles.map(c=>+c.volume??0);
      return {H,L,C,V};
    }
    if (Array.isArray(j?.closes) && j.closes.length){
      const H=j.highs?.map(Number), L=j.lows?.map(Number), C=j.closes.map(Number), V=j.volume?.map(Number);
      return {H,L,C,V};
    }
    return null;
  }
  async function fromBinance(sym,intv,limit=300){
    const u=`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${intv}&limit=${limit}`;
    const r=await fetch(u); const a=await r.json(); if(!Array.isArray(a)) return null;
    const H=a.map(x=>+x[2]), L=a.map(x=>+x[3]), C=a.map(x=>+x[4]), V=a.map(x=>+x[5]); return {H,L,C,V};
  }
  async function getCandles(sym,intv,limit=300){ try{ const b=await fromBackend(sym,intv,limit); if(b) return b; }catch{} return await fromBinance(sym,intv,limit); }

  async function loadMain(){
    if(!symbol) return;
    const d = await getCandles(symbol, interval, 300); if(!d) return;
    setMain({ highs:d.H, lows:d.L, closes:d.C, volume:d.V });

    const ema20=EMA(d.C,20), ema50=EMA(d.C,50), ema200=EMA(d.C,200);
    const { K:stK, D:stD } = Stoch(d.H,d.L,d.C,14,3);
    const { K:sK, D:sD }   = StochRSI(d.C,14,14,3);
    const { up:bbU, low:bbL } = Boll(d.C,20,2);
    const rsi14 = RSI(d.C,14);
    const mac = MACD(d.C,12,26,9);
    const atr14 = ATR(d.H,d.L,d.C,14);

    setInd({
      sma20:SMA(d.C,20).at(-1), sma50:SMA(d.C,50).at(-1), sma200:SMA(d.C,200).at(-1),
      ema20:ema20.at(-1), ema50:ema50.at(-1), ema200:ema200.at(-1),
      rsi14:rsi14.at(-1),
      stochK:stK.at(-1), stochD:stD.at(-1),
      stochRsiK:sK.at(-1), stochRsiD:sD.at(-1),
      bbUpper:bbU.at(-1), bbLower:bbL.at(-1),
      macd:mac.macd.at(-1), macdSig:mac.signal.at(-1), macdHist:mac.hist.at(-1),
      atr14:atr14.at(-1),
      closes:d.C
    });
  }

  async function loadTrends(){
    if(!symbol) return;
    const entries = await Promise.all(TREND_TFS.map(async tf=>{
      const d = await getCandles(symbol, tf, 300);
      return [tf, d?.C || []];
    }));
    const map = Object.fromEntries(entries);
    const t={}, b={};
    for(const tf of TREND_TFS){
      const c = map[tf]; t[tf]=trendEval(c);
      if(!c || c.length<22) b[tf]="—";
      else { const e20=EMA(c,20); const side=(c.at(-1)>e20.at(-1) && (e20.at(-1)-e20.at(-2))>=0)?"LONG":(c.at(-1)<e20.at(-1) && (e20.at(-1)-e20.at(-2))<=0)?"SHORT":"—"; b[tf]=side; }
    }
    setTrendMap(t); setBiasMap(b);
  }

  useEffect(()=>{ loadMain(); }, [symbol, interval]);
  useEffect(()=>{ const t=setInterval(loadMain, 3000); return ()=>clearInterval(t); }, [symbol, interval]);
  useEffect(()=>{ loadTrends(); }, [symbol]);
  useEffect(()=>{ const t=setInterval(loadTrends, 12000); return ()=>clearInterval(t); }, [symbol]);

  // price WS
  useEffect(()=>{
    if(!symbol) return;
    try{
      if(priceWS.current) { try{priceWS.current.close();}catch{} priceWS.current=null; }
      const url = `wss://fstream.binance.com/stream?streams=${symbol.toLowerCase()}@miniTicker`;
      const ws = new WebSocket(url); priceWS.current = ws;
      ws.onmessage = ev => {
        try{
          const d = JSON.parse(ev.data)?.data;
          if(d?.e==="24hrMiniTicker") setTick({ last:+d.c, chg:+d.P });
        }catch{}
      };
      return ()=>{ try{ws.close();}catch{} };
    }catch{}
  }, [symbol]);

  // whale flow (>=flowMin)
  useEffect(()=>{
    if(!symbol) return;
    try{
      if(flowWS.current){ try{flowWS.current.close();}catch{} flowWS.current=null; }
      const url=`wss://fstream.binance.com/stream?streams=${symbol.toLowerCase()}@aggTrade`;
      const ws=new WebSocket(url); flowWS.current=ws;
      let lastP=null;
      ws.onmessage = ev => {
        try{
          const d=JSON.parse(ev.data)?.data; if(!d) return;
          const price=+d.p, qty=+d.q, usd=price*qty;
          if(usd>=flowMin){
            let side = d.m ? "SELL" : "BUY";
            if(lastP!=null && price>lastP) side="BUY";
            if(lastP!=null && price<lastP) side="SELL";
            lastP=price;
            setFlows(arr=>[{t:Date.now(), side, price, qty, usd}, ...arr].slice(0,80));
          }
        }catch{}
      };
      return ()=>{ try{ws.close();}catch{} };
    }catch{}
  }, [symbol, flowMin]);

  // entry & SR
  const entry = tick.last ?? ind?.closes?.at(-1) ?? null;
  const sr = useMemo(()=>{
    const C = ind?.closes || [];
    const price = entry;
    if(!C.length || price==null) return {supports:[], resistances:[]};
    // basit swingi closes'tan türet
    const highs=[], lows=[]; const look=3;
    for(let i=look;i<C.length-look;i++){
      const w=C.slice(i-look,i+look+1); const hi=Math.max(...w), lo=Math.min(...w);
      if(C[i]===hi) highs.push(hi); if(C[i]===lo) lows.push(lo);
    }
    const up = highs.filter(v=>v>price).sort((a,b)=>a-b).slice(0,3);
    const dn = lows.filter(v=>v<price).sort((a,b)=>b-a).slice(0,3);
    return {supports:dn, resistances:up};
  }, [ind?.closes, entry]);
  const longTP=[sr.resistances[0],sr.resistances[1],sr.resistances[2]];
  const shortTP=[sr.supports[0],sr.supports[1],sr.supports[2]];
  const longSL=sr.supports[0]??null;
  const shortSL=sr.resistances[0]??null;

  const LSP = useMemo(()=>{
    if(!ind?.closes?.length) return { longPct:50, shortPct:50 };
    return longShortPct(entry, ind?.ema20, ind?.rsi14, ind?.stochK, ind?.stochD, ind?.bbUpper, ind?.bbLower);
  }, [ind, entry]);

  function toggleFav(){
    try{
      const a = JSON.parse(localStorage.getItem("favSymbols")||"[]");
      const set = new Set(a);
      fav ? set.delete(symbol) : set.add(symbol);
      const arr = Array.from(set);
      localStorage.setItem("favSymbols", JSON.stringify(arr));
      setFav(!fav);
    }catch{}
  }

  return (
    <main style={{ padding:"14px 16px", fontSize:14, lineHeight:1.35 }}>
      {/* Header */}
      <div style={{ marginBottom: 10, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
        <Link href="/" style={{ color:"#9bd0ff", textDecoration:"none" }}>← Ana Sayfa</Link>
        <span style={{ opacity:.6 }}>•</span>
        <b style={{ color:"#9bd0ff", fontSize:18 }}>{symbol || "—"}</b>
        <button onClick={toggleFav} className="btn" title="Favori"> {fav ? "★ Favori" : "☆ Favori"} </button>
        <span style={{ marginLeft:10, opacity:.8 }}>Entry: <b>{fmtPrice(entry)}</b></span>
        <span style={{ marginLeft:8, color: tick.chg==null ? "#d0d6e6" : (tick.chg>=0?"#22d39a":"#ff6b6b"), fontWeight:800 }}>
          {tick.chg==null?"":(tick.chg>=0?"+":"")+fmt(tick.chg,2)+"%"}
        </span>
        <span style={{ marginLeft:"auto" }}>
          <select value={interval} onChange={e=>setIntervalStr(e.target.value)}
            style={{ padding:"6px 8px", background:"#121625", border:"1px solid #23283b", borderRadius:8, color:"#e6e6e6" }}>
            {["1m","3m","5m","15m","30m","1h","2h","3h","4h","12h","1d","3d"].map(x=><option key={x} value={x}>{x}</option>)}
          </select>
        </span>
      </div>

      {/* Trend — SADE: LONG / SHORT / — */}
      <Box title="Trend Kırılımları">
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(110px, 1fr))", gap:8 }}>
          {["1m","3m","5m","15m","30m","1h","4h","1d","3d"].map(tf=>(
            <Chip key={tf} label={tf.toUpperCase()} side={biasMap[tf]} />
          ))}
        </div>
      </Box>

      {/* Entry / TP / SL + Long/Short oran */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(260px,1fr))", gap:10, marginBottom:10 }}>
        <Box title={`Long (${fmt(LSP.longPct,0)}%) — Entry / TP / SL`}>
          <div>Entry: <b>{fmtPrice(entry)}</b></div>
          <ul style={{ margin:"6px 0 0 18px" }}>
            <li>TP1: {fmtPrice(longTP[0])}</li>
            <li>TP2: {fmtPrice(longTP[1])}</li>
            <li>TP3: {fmtPrice(longTP[2])}</li>
            <li>SL:  {fmtPrice(longSL)}</li>
          </ul>
        </Box>
        <Box title={`Short (${fmt(LSP.shortPct,0)}%) — Entry / TP / SL`}>
          <div>Entry: <b>{fmtPrice(entry)}</b></div>
          <ul style={{ margin:"6px 0 0 18px" }}>
            <li>TP1: {fmtPrice(shortTP[0])}</li>
            <li>TP2: {fmtPrice(shortTP[1])}</li>
            <li>TP3: {fmtPrice(shortTP[2])}</li>
            <li>SL:  {fmtPrice(shortSL)}</li>
          </ul>
        </Box>
        <Box title="Destek / Direnç">
          <div>Destek: {sr.supports?.length ? sr.supports.map(v=>fmtPrice(v)).join(" • ") : "—"}</div>
          <div style={{ marginTop:4 }}>Direnç: {sr.resistances?.length ? sr.resistances.map(v=>fmtPrice(v)).join(" • ") : "—"}</div>
        </Box>
      </div>

      {/* İndikatör Grupları + Akış */}
      <div style={{ display:"grid", gridTemplateColumns:"minmax(320px, 1fr) minmax(320px, 1fr)", gap:10, alignItems:"start" }}>
        <div style={{ display:"grid", gap:10 }}>
          <Box title="SMAs">
            <KV name="SMA20" v={ind?.sma20} />
            <KV name="SMA50" v={ind?.sma50} />
            <KV name="SMA200" v={ind?.sma200} />
          </Box>
          <Box title="EMAs">
            <KV name="EMA20" v={ind?.ema20} />
            <KV name="EMA50" v={ind?.ema50} />
            <KV name="EMA200" v={ind?.ema200} />
          </Box>
          <Box title="MACD">
            <KV name="MACD" v={ind?.macd} d={4} />
            <KV name="Signal" v={ind?.macdSig} d={4} />
            <KV name="Histogram" v={ind?.macdHist} d={4} />
          </Box>

          {/* Sekmeli: BB & ATR */}
          <TabbedBBATR bbUpper={ind?.bbUpper} bbLower={ind?.bbLower} atr14={ind?.atr14} />
          
          {/* Stoch grubu: üstte Stoch, çizgi, altta StochRSI + RSI14 */}
          <Box title="Stoch / StochRSI">
            <KV name="Stoch K" v={ind?.stochK} d={2} />
            <KV name="Stoch D" v={ind?.stochD} d={2} />
            <div style={{borderTop:"1px dashed #2a355a", margin:"8px 0"}}/>
            <KV name="StochRSI K" v={ind?.stochRsiK} d={2} />
            <KV name="StochRSI D" v={ind?.stochRsiD} d={2} />
            <KV name="RSI14" v={ind?.rsi14} d={2} />
          </Box>
        </div>

        <Box title="Anlık Para Akışı">
          <div style={{ marginBottom:8 }}>
            Filtre:
            <button className="btn" onClick={()=>setFlowMin(100000)} style={{marginLeft:8}}>≥ $100k</button>
            <button className="btn" onClick={()=>setFlowMin(500000)} style={{marginLeft:6}}>≥ $500k</button>
            <button className="btn" onClick={()=>setFlowMin(1000000)} style={{marginLeft:6}}>≥ $1M</button>
          </div>
          <div style={{ maxHeight: 340, overflowY: "auto" }}>
            {!flows.length && <div style={{ opacity:.7 }}>Henüz kayıt yok…</div>}
            {flows.map((it,idx)=>(
              <div key={idx} style={{ display:"grid", gridTemplateColumns:"80px 1fr 1fr 1fr", gap:8, padding:"6px 0", borderTop:"1px solid #1f2742" }}>
                <div style={{ opacity:.7 }}>{new Date(it.t).toLocaleTimeString("tr-TR")}</div>
                <div style={{ fontWeight:800, color: it.side==="BUY" ? "#22d39a" : "#ff6b6b" }}>{it.side}</div>
                <div style={{ textAlign:"right" }}>Fiyat: <b>{fmtPrice(it.price)}</b></div>
                <div style={{ textAlign:"right" }}>USD: <b>{fmt(it.usd,0)}</b> — Adet: <b>{fmt(it.qty,4)}</b></div>
              </div>
            ))}
          </div>
        </Box>
      </div>

      {/* Yön Matrisi */}
      <Box title="Yön Matrisi (EMA20)">
        <div style={{ display:"grid", gap:10 }}>
          <RowMatrix label="Dakika" list={["1m","3m","5m","15m","30m"]} bias={biasMap} />
          <RowMatrix label="Saat"   list={["1h","4h"]}  bias={biasMap} />
          <RowMatrix label="Gün"    list={["1d","3d"]}  bias={biasMap} />
        </div>
      </Box>

      <div style={{ opacity:.7, fontSize:12, marginTop:8 }}>
        Otomatik hesaplamadır; hata payı vardır. Bu içerik yatırım tavsiyesi değildir.
      </div>
    </main>
  );
}

/* ===== Tiny UI parts ===== */
function Box({ title, children }) {
  return (
    <div style={{ background:"#121a33", border:"1px solid #202945", borderRadius:10, padding:12, color:"#e6edf6", marginBottom:10 }}>
      <div style={{ fontWeight:800, marginBottom:6, color:"#9bd0ff" }}>{title}</div>
      {children}
    </div>
  );
}
function Chip({ label, side }) {
  const color = side==="LONG" ? "#22d39a" : side==="SHORT" ? "#ff6b6b" : "#9aa4b2";
  const text  = side || "—";
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, padding:"8px 10px", border:"1px solid #202945", borderRadius:8 }}>
      <span style={{ opacity:.85 }}>{label}</span>
      <b style={{ color }}>{text}</b>
    </div>
  );
}
function KV({ name, v, d=2 }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:10, padding:"4px 0" }}>
      <div style={{ opacity:.85 }}>{name}</div>
      <div style={{ fontWeight:700 }}>{v==null?"—":fmtPrice(typeof v==="number"?v:Number(v))}</div>
    </div>
  );
}
function RowMatrix({ label, list, bias }) {
  const color = (b) => b==="LONG" ? "#22d39a" : b==="SHORT" ? "#ff6b6b" : "#9aa4b2";
  return (
    <div style={{ display:"grid", gridTemplateColumns:"90px repeat(auto-fit, minmax(80px, 1fr))", gap:8, alignItems:"center" }}>
      <div style={{ opacity:.8 }}>{label}</div>
      {list.map(tf=>(
        <div key={tf} style={{ padding:"6px 8px", border:"1px solid #202945", borderRadius:8, textAlign:"center", fontWeight:800, color:color(bias[tf]) }}>
          {tf.toUpperCase()} • {bias[tf] || "—"}
        </div>
      ))}
    </div>
  );
}
/* Sekmeli BB & ATR */
function TabbedBBATR({ bbUpper, bbLower, atr14 }) {
  const [tab, setTab] = useState("BB");
  const Tab = ({ t }) => (
    <button onClick={()=>setTab(t)}
      className="btn"
      style={{ marginRight:8 }}
    >{t}</button>
  );
  return (
    <Box title="BB & ATR">
      <div style={{ marginBottom:8 }}>
        <Tab t="BB" /><Tab t="ATR" />
      </div>
      {tab==="BB" ? (
        <>
          <KV name="BB Üst" v={bbUpper} />
          <KV name="BB Alt" v={bbLower} />
        </>
      ) : (
        <KV name="ATR14" v={atr14} d={4} />
      )}
    </Box>
  );
}
