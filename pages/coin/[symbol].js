// pages/coin/[symbol].js
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

/* ===== Helpers ===== */
const last = (arr)=> Array.isArray(arr)&&arr.length ? arr[arr.length-1] : null;
const fmt = (v, d = 2) => v==null||isNaN(v) ? "—" :
  Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d, maximumFractionDigits:d});
const fmtPrice = (v)=>{ if(v==null||isNaN(v)) return "—"; const a=Math.abs(v); const d=a>=100?2:a>=1?4:6;
  return Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d, maximumFractionDigits:d}); };

/* ===== Indicators ===== */
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

/* ===== Trend (EMA20) ===== */
const trendEval=(closes)=>{ if(!closes||closes.length<22) return "—";
  const e20=EMA(closes,20); const c=last(closes), e=last(e20), ep=e20[e20.length-2] ?? null;
  if([c,e,ep].some(x=>x==null)) return "—"; const slope=e-ep;
  if(c>e && slope>=0) return "LONG";
  if(c<e && slope<=0) return "SHORT";
  return "—";
};

/* ===== Destek/Direnç çıkarımı ===== */
function findLevels(H,L,C, window=12, dedupPct=0.003){
  const n=C?.length||0; if(!H||!L||!C||n<window*2+5) return {levels:[], supports:[], resistances:[]};
  const raw=[];
  for(let i=window;i<n-window;i++){
    let isHigh=true,isLow=true;
    for(let j=i-window;j<=i+window;j++){
      if(H[j]>H[i]) isHigh=false;
      if(L[j]<L[i]) isLow=false;
      if(!isHigh && !isLow) break;
    }
    if(isHigh) raw.push({price:H[i], type:"R"});
    if(isLow)  raw.push({price:L[i], type:"S"});
  }
  raw.sort((a,b)=>a.price-b.price);
  const merged=[];
  for(const lv of raw){
    if(!merged.length){ merged.push({...lv, count:1}); continue; }
    const last=merged[merged.length-1];
    if(Math.abs(lv.price-last.price)/last.price <= dedupPct){
      last.price=(last.price*last.count + lv.price)/(last.count+1);
      last.count++;
      if(last.type!==lv.type) last.type="SR";
    }else merged.push({...lv, count:1});
  }
  const px = last(C);
  const supports = merged.filter(x=>x.price<px).map(x=>x.price);
  const resistances = merged.filter(x=>x.price>px).map(x=>x.price);
  return { levels: merged.map(({price,type})=>({price,type})), supports, resistances, price:px };
}

export default function CoinDetail(){
  const router = useRouter();
  const raw = router.query.symbol;
  const symbol = useMemo(()=>{
    if(!raw) return null; const s=String(raw).toUpperCase(); return s.endsWith("USDT")?s:(s+"USDT");
  }, [raw]);

  const TREND_TFS = ["1m","3m","5m","15m","30m","1h","2h","3h","4h","12h","1d","3d"];
  const [interval, setIntervalStr] = useState("1m");
  const [ind, setInd] = useState(null);
  const [trendMap, setTrendMap] = useState({});
  const [tick, setTick] = useState({ last:null, chg:null });
  const [sr, setSR] = useState({ supports:[], resistances:[], price:null });

  /* fiyat WS (miniTicker) */
  useEffect(()=>{
    if(!symbol) return;
    const url = `wss://fstream.binance.com/stream?streams=${symbol.toLowerCase()}@miniTicker`;
    let ws;
    try{
      ws = new WebSocket(url);
      ws.onmessage = (ev)=>{
        try{
          const d = JSON.parse(ev.data)?.data;
          if(d && d.e==="24hrMiniTicker") setTick({ last:+d.c, chg:+d.P });
        }catch{}
      };
    }catch{}
    return ()=>{ try{ws && ws.close();}catch{} };
  }, [symbol]);

  /* candle fetch */
  async function getCandles(sym,intv,limit=300){
    try{
      const r=await fetch(`/api/futures/indicators?symbol=${sym}&interval=${intv}&limit=${limit}`,{cache:"no-store"});
      const j=await r.json();
      if (Array.isArray(j?.candles) && j.candles.length){
        const H=j.candles.map(c=>+c.high), L=j.candles.map(c=>+c.low), C=j.candles.map(c=>+c.close);
        return {H,L,C};
      }
      if (Array.isArray(j?.closes) && j.closes.length){
        return {H:j.highs?.map(Number), L:j.lows?.map(Number), C:j.closes.map(Number)};
      }
    }catch{}
    // Binance fallback (client)
    try{
      const u=`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${intv}&limit=${limit}`;
      const r=await fetch(u); const a=await r.json(); if(!Array.isArray(a)) return null;
      return {H:a.map(x=>+x[2]), L:a.map(x=>+x[3]), C:a.map(x=>+x[4])};
    }catch{ return null; }
  }

  async function loadAll(){
    if(!symbol) return;
    const d = await getCandles(symbol, interval, 300); if(!d) return;

    // indikatörler
    const ema20=EMA(d.C,20), ema50=EMA(d.C,50), ema200=EMA(d.C,200);
    const sma20=SMA(d.C,20), sma50=SMA(d.C,50), sma200=SMA(d.C,200);
    const rsi14 = RSI(d.C,14);
    const stR = StochRSI(d.C,14,14,3);
    const stK = Stoch(d.H,d.L,d.C,14,3);
    const bb  = Boll(d.C,20,2);
    const mac = MACD(d.C,12,26,9);
    const atr14 = ATR(d.H,d.L,d.C,14);

    setInd({
      sma20:last(sma20), sma50:last(sma50), sma200:last(sma200),
      ema20:last(ema20), ema50:last(ema50), ema200:last(ema200),
      rsi14:last(rsi14),
      stochRsiK:last(stR.K), stochRsiD:last(stR.D),
      stochK:last(stK.K), stochD:last(stK.D),
      bbUpper:last(bb.up), bbLower:last(bb.low),
      macd:last(mac.macd), macdSig:last(mac.signal), macdHist:last(mac.hist),
      atr14:last(atr14),
      closes: d.C
    });

    // destek/direnç hesapla
    const levels = findLevels(d.H,d.L,d.C, 12, 0.003);
    setSR(levels);
  }
  useEffect(()=>{ loadAll(); }, [symbol, interval]);
  useEffect(()=>{ const t=setInterval(loadAll, 3000); return ()=>clearInterval(t); }, [symbol, interval]);

  // trend matrisi (EMA20)
  useEffect(()=>{
    let mounted=true;
    (async()=>{
      if(!symbol) return;
      const entries = await Promise.all(TREND_TFS.map(async tf=>{
        const d = await getCandles(symbol, tf, 200);
        return [tf, d?.C || []];
      }));
      if(!mounted) return;
      const map = Object.fromEntries(entries);
      const t={};
      for(const tf of TREND_TFS){
        t[tf]=trendEval(map[tf]);
      }
      setTrendMap(t);
    })();
    return ()=>{ mounted=false; };
  }, [symbol]);

  const entry = tick.last ?? (ind?.closes ? last(ind.closes) : null);

  // Trade planı: yakın 2 destek/2 direnç + TP/SL + R/R
  const supSorted = [...(sr.supports||[])].sort((a,b)=>Math.abs(entry-a)-Math.abs(entry-b));
  const resSorted = [...(sr.resistances||[])].sort((a,b)=>Math.abs(a-entry)-Math.abs(b-entry));

  // LONG
  const slLong = supSorted.find(v=>v < entry) ?? null;
  const tpL = resSorted.slice(0,3);
  const rrL = tpL.map(tp => (tp!=null && slLong!=null && entry!=null && entry>slLong) ? ( (tp-entry)/(entry-slLong) ) : null);

  // SHORT
  const slShort = resSorted.find(v=>v > entry) ?? null;
  const supDesc = [...(sr.supports||[])].filter(v=>v<entry).sort((a,b)=>b-a);
  const tpS = supDesc.slice(0,3);
  const rrS = tpS.map(tp => (tp!=null && slShort!=null && entry!=null && slShort>entry) ? ( (entry-tp)/(slShort-entry) ) : null);

  return (
    <main style={{ padding:"14px 16px", fontSize:14, lineHeight:1.35 }}>
      {/* Header */}
      <div style={{ marginBottom: 10, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
        <Link href="/" style={{ color:"#9bd0ff", textDecoration:"none" }}>← Ana Sayfa</Link>
        <span style={{ opacity:.6 }}>•</span>
        <b style={{ color:"#9bd0ff", fontSize:18 }}>{symbol || "—"}</b>
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

      {/* Trend — sadece LONG/SHORT/— */}
      <Box title="Trend Kırılımları (EMA20)">
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(110px, 1fr))", gap:8 }}>
          {["1m","3m","5m","15m","30m","1h","2h","3h","4h","12h","1d","3d"].map(tf=>(
            <Chip key={tf} label={tf.toUpperCase()} side={trendMap[tf]} />
          ))}
        </div>
      </Box>

      {/* Destek / Direnç (yakın) */}
      <Box title="Destek / Direnç (En Yakınlar)">
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:10}}>
          <div>
            <div style={{opacity:.8, marginBottom:6}}>Destekler</div>
            {(sr.supports||[]).slice(-3).map((v,i)=> <KV key={"s"+i} name={`S${i+1}`} v={v} /> )}
          </div>
          <div>
            <div style={{opacity:.8, marginBottom:6}}>Dirençler</div>
            {(sr.resistances||[]).slice(0,3).map((v,i)=> <KV key={"r"+i} name={`R${i+1}`} v={v} /> )}
          </div>
        </div>
      </Box>

      {/* Trade Planı */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:10 }}>
        <Box title="AL Trade Plan (Long)">
          <KV name="Entry" v={entry} />
          <KV name="SL" v={slLong} />
          <div style={{borderTop:"1px dashed #2a355a", margin:"8px 0"}}/>
          <KV name="TP1" v={tpL[0]} />
          <KV name="TP2" v={tpL[1]} />
          <KV name="TP3" v={tpL[2]} />
          <div style={{borderTop:"1px dashed #2a355a", margin:"8px 0"}}/>
          <KV name="R/R1" v={rrL[0]!=null ? Number(rrL[0]).toFixed(2) : "—"} d={2}/>
          <KV name="R/R2" v={rrL[1]!=null ? Number(rrL[1]).toFixed(2) : "—"} d={2}/>
          <KV name="R/R3" v={rrL[2]!=null ? Number(rrL[2]).toFixed(2) : "—"} d={2}/>
        </Box>

        <Box title="SAT Trade Plan (Short)">
          <KV name="Entry" v={entry} />
          <KV name="SL" v={slShort} />
          <div style={{borderTop:"1px dashed #2a355a", margin:"8px 0"}}/>
          <KV name="TP1" v={tpS[0]} />
          <KV name="TP2" v={tpS[1]} />
          <KV name="TP3" v={tpS[2]} />
          <div style={{borderTop:"1px dashed #2a355a", margin:"8px 0"}}/>
          <KV name="R/R1" v={rrS[0]!=null ? Number(rrS[0]).toFixed(2) : "—"} d={2}/>
          <KV name="R/R2" v={rrS[1]!=null ? Number(rrS[1]).toFixed(2) : "—"} d={2}/>
          <KV name="R/R3" v={rrS[2]!=null ? Number(rrS[2]).toFixed(2) : "—"} d={2}/>
        </Box>
      </div>

      {/* İndikatör Kutuları */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(280px,1fr))", gap:10 }}>
        <Box title="SMA (20 / 50 / 200)">
          <KV name="SMA20" v={ind?.sma20} />
          <KV name="SMA50" v={ind?.sma50} />
          <KV name="SMA200" v={ind?.sma200} />
        </Box>

        <Box title="EMA (20 / 50 / 200)">
          <KV name="EMA20" v={ind?.ema20} />
          <KV name="EMA50" v={ind?.ema50} />
          <KV name="EMA200" v={ind?.ema200} />
        </Box>

        <Box title="MACD">
          <KV name="MACD" v={ind?.macd} d={4} />
          <KV name="Signal" v={ind?.macdSig} d={4} />
          <KV name="Histogram" v={ind?.macdHist} d={4} />
        </Box>

        <Box title="StochRSI + RSI">
          <KV name="StochRSI K" v={ind?.stochRsiK} d={2} />
          <KV name="StochRSI D" v={ind?.stochRsiD} d={2} />
          <div style={{borderTop:"1px dashed #2a355a", margin:"8px 0"}}/>
          <KV name="RSI14" v={ind?.rsi14} d={2} />
        </Box>

        <Box title="Bollinger Bantları">
          <KV name="BB Üst" v={ind?.bbUpper} />
          <KV name="BB Alt" v={ind?.bbLower} />
        </Box>

        <Box title="Diğer">
          <KV name="ATR14" v={ind?.atr14} d={4} />
          <KV name="Stoch K" v={ind?.stochK} d={2} />
          <KV name="Stoch D" v={ind?.stochD} d={2} />
        </Box>
      </div>

      <div style={{ opacity:.7, fontSize:12, marginTop:8 }}>
        Otomatik hesaplamadır; hata payı vardır. Yatırım tavsiyesi değildir.
      </div>
    </main>
  );
}

/* ===== UI ===== */
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
  const value = v==null ? "—" : (typeof v==="number" ? Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d, maximumFractionDigits:d}) : v);
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:10, padding:"4px 0" }}>
      <div style={{ opacity:.85 }}>{name}</div>
      <div style={{ fontWeight:700 }}>{value}</div>
    </div>
  );
}
