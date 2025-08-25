// pages/coin/[symbol].js
"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";

const INDICATORS_API = (sym, interval, limit=300) =>
  `/api/futures/indicators?symbol=${sym}&interval=${interval}&limit=${limit}`;

const TI = [
  { g:"Dakika", vals:["1m","3m","5m","15m","30m"] },
  { g:"Saat",   vals:["1h","2h","3h","4h"] },
  { g:"Gün",    vals:["1d","3d"] },
  { g:"Hafta",  vals:["1w","3w"] },
  { g:"Ay",     vals:["1M","3M","6M","12M"] },
];

const fmt = (v,d=2)=> (v==null||isNaN(v)) ? "—" : Number(v).toLocaleString("tr-TR",{maximumFractionDigits:d});
const clamp = (x,min,max)=> Math.max(min, Math.min(max,x));

function bias(L){
  if(!L) return { longPct:50, shortPct:50, score:0 };
  const close=L?.close, ema=L?.ema20, rsi=L?.rsi14, k=L?.stochK, d=L?.stochD, bu=L?.bbUpper, bl=L?.bbLower;
  const emaDist = (close!=null && ema!=null) ? ((close-ema)/ema*100) : null;
  const kCross  = (k!=null && d!=null) ? (k-d) : null;
  const bandPos = (bu!=null && bl!=null && close!=null) ? ((close-bl)/(bu-bl)*100) : null;
  const nEMA   = emaDist==null ? 0 : clamp(emaDist/3, -1, 1);
  const nRSI   = rsi==null ? 0 : clamp((rsi-50)/25, -1, 1);
  const nKxD   = kCross==null ? 0 : clamp(kCross/50, -1, 1);
  const nBand  = bandPos==null ? 0 : clamp((bandPos-50)/30, -1, 1);
  const wEMA=0.35, wRSI=0.30, wKxD=0.20, wBand=0.15;
  const score = (wEMA*nEMA + wRSI*nRSI + wKxD*nKxD + wBand*nBand);
  const longPct = Math.round( (score+1)/2 * 100 ); const shortPct = 100 - longPct;
  return { longPct, shortPct, score };
}

export default function CoinDetail(){
  const router = useRouter();
  const sym = useMemo(()=> String(router.query.symbol||"").toUpperCase(), [router.query.symbol]);

  const [sel, setSel] = useState("1m");
  const [rows, setRows] = useState({});
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  async function load(intervals = TI.flatMap(x=>x.vals)) {
    if (!sym) return;
    setLoading(true);
    try {
      const res = await Promise.all(intervals.map(v =>
        fetch(INDICATORS_API(sym, v, 200), { cache:"no-store" })
          .then(r=>r.ok ? r.json() : null).catch(()=>null)
      ));
      const map = {}; intervals.forEach((v,i)=> map[v]=res[i]); setRows(map);
    } finally { setLoading(false); }
  }

  useEffect(()=>{ if(sym) load(); }, [sym]);
  useEffect(()=>{
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(()=>load([sel]), 3000); // 3 sn
    return ()=> clearInterval(timer.current);
  }, [sym, sel]);

  // AI benzeri yorum (sadece oran/sinyal, yönlendirme yok)
  const latest = rows[sel]?.latest || null;
  const { longPct, shortPct } = bias(latest);
  const signal = longPct >= 55 ? "AL lehine" : shortPct >= 55 ? "SAT lehine" : "NÖTR";

  // Hacim ve “anlık al/sat” göstergesi: son bar hacmi + son agg qty (veri kaynağına bağlı, burada bar hacmi)
  const vol = latest?.volume;

  return (
    <main style={{padding:"12px 14px", background:"#0f1320", minHeight:"100vh", color:"#e5ecff", fontSize:14}}>
      <h1 style={{margin:"4px 0 12px", fontSize:18, fontWeight:900}}>{sym} • Detay</h1>

      {/* Zaman aralığı seçimi */}
      <div style={{display:"flex", gap:8, flexWrap:"wrap", marginBottom:10}}>
        {TI.map(gr=>(
          <div key={gr.g} style={{display:"flex", alignItems:"center", gap:6, background:"#141a2a", padding:"6px 8px", borderRadius:10}}>
            <b style={{opacity:.9}}>{gr.g}</b>
            {gr.vals.map(v=>(
              <button key={v} onClick={()=>setSel(v)}
                style={{padding:"4px 8px", borderRadius:8, border:"1px solid #2b3758",
                        background: sel===v ? "#1c2742" : "transparent", color:"#dbe4ff", cursor:"pointer"}}>
                {v}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Hızlı kartlar (yazılar küçük) */}
      <section style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px,1fr))", gap:10, marginBottom:12}}>
        <MiniCard title="Sinyal ağırlığı" value={signal} sub={`Long ${longPct}% / Short ${shortPct}%`} />
        <MiniCard title="Son Fiyat" value={fmt(latest?.close, 6)} sub={`EMA20 mesafe: ${fmt(((latest?.close - latest?.ema20)/latest?.ema20)*100,2)}%`} />
        <MiniCard title="RSI14" value={fmt(latest?.rsi14, 2)} sub="50 üstü momentum lehine" />
        <MiniCard title="Hacim (bar)" value={fmt(vol,2)} sub="Anlık al/sat baskısı için referans" />
      </section>

      {/* Destek/Direnç & TP seviyeleri — basit otomatik hesap (deneme) */}
      <SupportResist sym={sym} rows={rows} sel={sel} />

      {/* AI-vari yorum (yatırım tavsiyesi DEĞİL) */}
      <div style={{marginTop:12, border:"1px solid #25304a", borderRadius:12, padding:12, background:"#0f1628"}}>
        <div style={{fontWeight:900, marginBottom:6}}>Al Trade Plan (beta)</div>
        <div style={{opacity:.95}}>
          Bu bölüm yalnızca **oran/sinyal** bilgi verir; <b>admin dışındakilere “gir/çık” önermez</b>.
          {signal==="NÖTR"
            ? <> Şu an denge bulunuyor. EMA20 mesafesi ve RSI14 birlikte nötr bölgede. Kırılım beklemek mantıklı olabilir.</>
            : signal.includes("AL")
              ? <> Long lehine eğilim var. RSI50 üstü, EMA20 üstü ise momentum uyumu görülür. Riske atılabilecek bölge ve pozisyon büyüklüğü tamamıyla kullanıcının tercihidir.</>
              : <> Short lehine eğilim var. RSI50 altı, EMA20 altı ise zayıflık teyit edilir. Bu bir yönlendirme değildir.</>
          }
        </div>
      </div>
    </main>
  );
}

function MiniCard({ title, value, sub }){
  return (
    <div style={{border:"1px solid #25304a", borderRadius:12, padding:10, background:"#0f1628"}}>
      <div style={{opacity:.8, fontSize:12}}>{title}</div>
      <div style={{fontWeight:900, fontSize:16}}>{value}</div>
      {sub && <div style={{opacity:.7, fontSize:12, marginTop:4}}>{sub}</div>}
    </div>
  );
}

/** Basit SR + TP tahmini (deneme):
 * - Son X bar high/low → yerel zirve/dip’lerden iki seviye seç
 * - TP1/TP2/TP3, en yakın direnç/ destek referans alınarak 0 ile bitmeyen yuvarlama
 */
function SupportResist({ sym, rows, sel }){
  const arr = rows[sel]?.rows || [];
  const last = rows[sel]?.latest || {};
  const highs = arr.map(r=>r.high).filter(v=>v!=null);
  const lows  = arr.map(r=>r.low ).filter(v=>v!=null);
  highs.sort((a,b)=>b-a); lows.sort((a,b)=>a-b);

  const res1 = highs[0], res2 = highs[5] ?? highs[1];
  const sup1 = lows[0],  sup2 = lows[5]  ?? lows[1];

  function roundNice(x){
    if (!x || isNaN(x)) return "—";
    // "hep 0'la bitiyor" olmasın diye, dinamik basamaklı yuvarlama
    const a = Math.abs(x);
    const d = a>=100 ? 2 : a>=1 ? 3 : 5;
    return Number(x).toLocaleString("tr-TR",{maximumFractionDigits:d});
  }

  // TP’ler: mevcut fiyata göre en yakın seviyelerden türetme (sadece gösterim)
  const close = last?.close;
  const tps = [];
  if (close && res1) tps.push({name:"TP1", val: res1});
  if (close && res2) tps.push({name:"TP2", val: res2});
  if (close && res2 && res1) tps.push({name:"TP3", val: res2 + (res1-res2)*0.618 });

  return (
    <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(240px,1fr))", gap:10}}>
      <MiniCard title="Destek" value={roundNice(sup1)} sub={`İkincil: ${roundNice(sup2)}`} />
      <MiniCard title="Direnç" value={roundNice(res1)} sub={`İkincil: ${roundNice(res2)}`} />
      <div style={{border:"1px solid #25304a", borderRadius:12, padding:10, background:"#0f1628"}}>
        <div style={{opacity:.8, fontSize:12}}>TP (deneme, SR tabanlı)</div>
        <div style={{display:"grid", gap:4}}>
          {tps.length ? tps.map(tp=>(
            <div key={tp.name} style={{display:"flex", justifyContent:"space-between"}}>
              <b>{tp.name}</b><span>{roundNice(tp.val)}</span>
            </div>
          )) : <span style={{opacity:.7}}>Veri yetersiz…</span>}
        </div>
      </div>
    </div>
  );
}
