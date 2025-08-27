// pages/panel-sinyal.js
import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

/**
 * Panel-Sinyal (Gün-İçi)
 * - Erişim: sadece "kurucu" | "yonetici" | "arkadas"
 * - Fiyat/24s değişim: Binance Futures miniTicker WS (~1 sn)
 * - İndikatör taraması: mod'a göre MTF (Scalper: 1m+5m | Gün-İçi: 5m+15m+1h)
 *   + opsiyonel 3m/30m/4h toggle
 * - Potansiyel: 1D veya 12h Bollinger band mesafesi (seçilebilir) — filtre >= %15/%20/%30
 * - Sinyal karar: ağırlıklı momentum (RSI, Stoch çapraz, close>EMA20, BB pozisyonu)
 * - MTF aynı-yön filtresi (opsiyonel)
 * - Entry/SL/TP1-TP3: ATR(15m) tabanlı (varsayılan k=1.5R)
 * - Yatırım tavsiyesi değildir.
 */

const ALLOWED_ROLES = new Set(["kurucu", "yonetici", "arkadas"]);

// Tarama listesi (istediğinde genişletiriz)
const SCAN_SYMBOLS = [
  "BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","ADAUSDT","DOGEUSDT",
  "LINKUSDT","TRXUSDT","MATICUSDT","DOTUSDT","AVAXUSDT","OPUSDT","ARBUSDT",
  "TONUSDT","ATOMUSDT","APTUSDT","FILUSDT","NEARUSDT","SUIUSDT"
];

// Modlara göre temel interval seti
const MODES = {
  scalper: ["1m","5m"],
  intraday: ["5m","15m","1h"]
};
const OPTIONALS = ["3m","30m","4h"];
const REFRESH_MS = 20_000;

// ----- helpers -----
const fmt = (v, d=2) => (v==null || isNaN(v)) ? "—"
  : Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d, maximumFractionDigits:d});

function bandPos(L){
  const c=L?.close, bu=L?.bbUpper, bl=L?.bbLower;
  if(c==null || bu==null || bl==null || bu===bl) return null;
  return ((c - bl)/(bu - bl))*100; // 0..100
}
function bbWidthPct(L){
  const c=L?.close, bu=L?.bbUpper, bl=L?.bbLower;
  if(c==null || bu==null || bl==null) return null;
  return (bu - bl) / c; // oransal genişlik
}
function momentumScore(L){
  if(!L) return 0;
  let s = 0;
  if (L.rsi14!=null){ if(L.rsi14>=55) s+=1; if(L.rsi14<=45) s-=1; }
  if (L.stochK!=null && L.stochD!=null){ if(L.stochK>L.stochD) s+=1; if(L.stochK<L.LstochD) s-=1; }
  if (L.stochK!=null && L.stochD!=null){ if(L.stochK<L.stochD) s-=1; } // düzeltme
  if (L.close!=null && L.ema20!=null){ if(L.close>L.ema20) s+=1; if(L.close<L.ema20) s-=1; }
  const bp = bandPos(L);
  if (bp!=null){ if(bp>=55) s+=0.5; if(bp<=45) s-=0.5; }
  return s; // ~ -3.5 .. +3.5
}
const IV_WEIGHT = { "1m":0.9, "3m":0.9, "5m":1.0, "15m":1.2, "30m":1.1, "1h":1.4, "4h":1.0 };

function decideDirection(frames){
  let wsum=0, wtot=0;
  for(const [iv,L] of Object.entries(frames)){
    const w = IV_WEIGHT[iv] ?? 1;
    wsum += momentumScore(L)*w;
    wtot += w;
  }
  const avg = wtot ? wsum/wtot : 0;
  if (avg >= 1.0)  return { dir:"LONG",  conf: Math.min(1,  avg/3.5) };
  if (avg <= -1.0) return { dir:"SHORT", conf: Math.min(1, -avg/3.5) };
  return { dir:"NEUTRAL", conf: 0.3 };
}

function reasonsText(frames, dir, potTxt){
  const parts=[];
  const brief=(tag,L)=>{
    if(!L) return;
    if (L.rsi14!=null) parts.push(`${tag} RSI=${fmt(L.rsi14,0)}`);
    if (L.stochK!=null && L.stochD!=null) parts.push(`${tag} Stoch ${L.stochK>L.stochD?"↑":L.stochK<L.stochD?"↓":"="}`);
    if (L.close!=null && L.ema20!=null) parts.push(`${tag} ${L.close>L.ema20?"EMA20 üstü":"EMA20 altı"}`);
  };
  ["1m","3m","5m","15m","30m","1h","4h"].forEach(iv => frames[iv] && brief(iv,frames[iv]));
  if (potTxt) parts.push(potTxt);
  return parts.slice(0,6).join(" • ");
}

// ----- API helpers -----
async function getLatest(symbol, interval){
  try{
    const r = await fetch(`/api/futures/indicators?symbol=${symbol}&interval=${interval}&limit=200`, { cache:"no-store" });
    const j = await r.json();
    return j?.latest || null;
  }catch{ return null; }
}

export default function PanelSinyal(){
  const router = useRouter();

  // --- access ---
  const [authOk, setAuthOk] = useState(false);
  useEffect(()=>{
    if(typeof window==="undefined") return;
    const raw=localStorage.getItem("kgz_user");
    let u=null; try{u=raw?JSON.parse(raw):null;}catch{}
    const role=u?.role;
    if(!role || !ALLOWED_ROLES.has(role)) router.replace("/login?next=/panel-sinyal");
    else setAuthOk(true);
  },[router]);

  // --- WS price ---
  const [wsTicks, setWsTicks] = useState({});
  useEffect(()=>{
    if(!authOk) return;
    const streams = SCAN_SYMBOLS.map(s=>`${s.toLowerCase()}@miniTicker`).join("/");
    const url = `wss://fstream.binance.com/stream?streams=${streams}`;
    let ws, tmr, pend={};
    try{
      ws=new WebSocket(url);
      ws.onmessage=(ev)=>{
        try{
          const d=JSON.parse(ev.data)?.data;
          if(!d?.s) return;
          const last = d?.c ? +d.c : null;
          const chg  = d?.P !== undefined ? +d.P : (d?.o && d?.c) ? ((+d.c - +d.o)/+d.o)*100 : null;
          pend[d.s]={last, chg};
          if(!tmr){ tmr=setTimeout(()=>{ setWsTicks(prev=>({...prev,...pend})); pend={}; tmr=null; }, 1000); }
        }catch{}
      };
    }catch{}
    return ()=>{ try{ ws && ws.close(); }catch{} };
  },[authOk]);

  // --- UI state ---
  const [mode, setMode] = useState("intraday"); // "scalper" | "intraday"
  const [use3m, setUse3m] = useState(false);
  const [use30m, setUse30m] = useState(false);
  const [use4h, setUse4h] = useState(false);

  const [potIv, setPotIv] = useState("1d"); // 1d | 12h
  const [minPot, setMinPot] = useState(0.20); // 0.15 | 0.20 | 0.30
  const [sameDir, setSameDir] = useState(true); // MTF aynı-yön şartı

  const [atrK, setAtrK] = useState(1.5);     // SL için ATR katsayı
  const [timeStopMin, setTimeStopMin] = useState(60); // bilgilendirme amaçlı

  const activeIntervals = useMemo(()=>{
    const base = [...MODES[mode]];
    if (use3m)  base.includes("3m") || base.splice(1,0,"3m"); // 1m sonrası
    if (use30m) base.push("30m");
    if (use4h)  base.push("4h");
    return base;
  },[mode,use3m,use30m,use4h]);

  // --- scan ---
  const [loading, setLoading] = useState(false);
  const [signals, setSignals] = useState([]);

  async function doScan(){
    setLoading(true);
    try{
      const out=[];
      const jobs = SCAN_SYMBOLS.map(async (sym)=>{
        // Potansiyel frame + aktif MTF frameleri + ATR referansı (15m)
        const promises = [
          getLatest(sym, potIv),
          ...activeIntervals.map(iv=>getLatest(sym, iv)),
          getLatest(sym, "15m")
        ];
        const res = await Promise.all(promises);
        const Lpot = res[0]; // 1d/12h
        if (!Lpot?.close || Lpot.bbUpper==null || Lpot.bbLower==null) return null;

        const frames = {};
        activeIntervals.forEach((iv,i)=> frames[iv]=res[i+1]);

        const atrRef = res[1+activeIntervals.length]; // 15m
        const atr = (atrRef?.atr14 && atrRef?.close) ? Number(atrRef.atr14) : null;

        // Momentum & yön
        const { dir, conf } = decideDirection(frames);

        // MTF aynı-yön filtresi
        if (sameDir && dir!=="NEUTRAL"){
          const signs = activeIntervals.map(iv=>{
            const s = momentumScore(frames[iv]);
            return s===0?0:(s>0?1:-1);
          }).filter(x=>x!==0);
          if (signs.length && !signs.every(x=>x===signs[0])) return null;
        }

        // Rejim filtresi (yaklaşık): 15m ve 1h EMA20 ilişkisi yönle uyumlu olsun
        const okRegime = (()=> {
          const L15=frames["15m"], L1h=frames["1h"];
          if (dir==="LONG"){
            if (L15 && !(L15.close>L15.ema20)) return false;
            if (L1h && !(L1h.close>L1h.ema20)) return false;
          }
          if (dir==="SHORT"){
            if (L15 && !(L15.close<L15.ema20)) return false;
            if (L1h && !(L1h.close<L1h.ema20)) return false;
          }
          return true;
        })();
        if (!okRegime) return null;

        // Sıkışma → kırılım (opsiyonel fikir): 15m BB genişliği çok dar ise +; ama zorunlu değil
        // const w15 = bbWidthPct(frames["15m"]); if (w15!=null && w15<0.01) {}

        // Potansiyel
        const c = Number(Lpot.close);
        const up   = (Number(Lpot.bbUpper) - c)/c;
        const down = (c - Number(Lpot.bbLower))/c;
        let pickPot=null, potTxt="";
        if (dir==="LONG"  && up  !=null){ pickPot=up;   potTxt=`${potIv.toUpperCase()} pot≈+${fmt(up*100,0)}%`; }
        if (dir==="SHORT" && down!=null){ pickPot=down; potTxt=`${potIv.toUpperCase()} pot≈-${fmt(down*100,0)}%`; }
        if (dir==="NEUTRAL" || pickPot==null) return null;
        if (pickPot < minPot) return null;

        // Fiyat
        const price = wsTicks[sym]?.last ??
                      frames["15m"]?.close ??
                      frames["1h"]?.close ??
                      Lpot?.close;

        // Entry/SL/TP (ATR tabanlı)
        let entry = price;
        let sl=null, tp1=null, tp2=null, tp3=null;
        if (entry && atr){
          const risk = atrK*atr;
          if (dir==="LONG"){
            sl  = entry - risk;
            tp1 = entry + risk;
            tp2 = entry + risk*2;
            tp3 = entry + risk*3;
          } else {
            sl  = entry + risk;
            tp1 = entry - risk;
            tp2 = entry - risk*2;
            tp3 = entry - risk*3;
          }
        }

        const reasons = reasonsText(frames, dir, potTxt);

        return {
          sym, dir, conf,
          potPct: Math.round(pickPot*100),
          price, reasons,
          atr, atrK, entry, sl, tp1, tp2, tp3
        };
      });

      const tmp = await Promise.all(jobs);
      tmp.filter(Boolean).forEach(x=>out.push(x));
      out.sort((a,b)=> (b.potPct - a.potPct) || (b.conf - a.conf));
      setSignals(out);
    } finally{ setLoading(false); }
  }

  // auto refresh
  useEffect(()=>{
    if(!authOk) return;
    let t = setInterval(doScan, REFRESH_MS);
    doScan();
    return ()=> clearInterval(t);
  },[authOk, mode, use3m, use30m, use4h, potIv, minPot, sameDir, atrK]);

  if(!authOk) return <main style={{padding:16}}><div style={{opacity:.7}}>Yetki doğrulanıyor…</div></main>;

  return (
    <main style={{ minHeight:"100vh", background:"#0f1320", color:"#e6f0ff", padding:"16px 18px", paddingBottom:60 }}>
      {/* Nav */}
      <nav style={{ display:"flex", gap:16, alignItems:"center", marginBottom:12, flexWrap:"wrap" }}>
        <button
          onClick={()=> (history.length>1 ? history.back() : router.push("/"))}
          style={{ background:"#1a1f2e", border:"1px solid #2a2f45", color:"#fff", borderRadius:8, padding:"6px 10px", cursor:"pointer" }}
        >
          ← Geri
        </button>
        <Link href="/" style={{ color:"#8bd4ff", fontWeight:900, fontSize:18, textDecoration:"none" }}>Kripto Gözü</Link>
        <Link href="/" style={{ color:"#d0d6e6", textDecoration:"none" }}>Ana Sayfa</Link>
        <Link href="/panel" style={{ color:"#d0d6e6", textDecoration:"none" }}>Panel</Link>
        <Link href="/whales" style={{ color:"#d0d6e6", textDecoration:"none" }}>Balina</Link>
        <Link href="/balina2d" style={{ color:"#d0d6e6", textDecoration:"none" }}>Balina2D</Link>
        <span style={{ marginLeft:"auto", opacity:.7 }}>Sadece: Kurucu / Yönetici / Arkadaş</span>
      </nav>

      <h1 style={{ marginTop:0, display:"flex", alignItems:"center", gap:10 }}>
        Panel – Sinyal (Gün-İçi) <LiveDot/>
      </h1>

      {/* Controls */}
      <div style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap", marginBottom:12 }}>
        <label style={lbl}>
          Mod
          <select value={mode} onChange={e=>setMode(e.target.value)} style={sel}>
            <option value="scalper">Scalper (1m + 5m)</option>
            <option value="intraday">Gün-İçi (5m + 15m + 1h)</option>
          </select>
        </label>

        <label style={lbl}><input type="checkbox" checked={use3m}  onChange={e=>setUse3m(e.target.checked)} /> 3m</label>
        <label style={lbl}><input type="checkbox" checked={use30m} onChange={e=>setUse30m(e.target.checked)} /> 30m</label>
        <label style={lbl}><input type="checkbox" checked={use4h}  onChange={e=>setUse4h(e.target.checked)} /> 4h</label>

        <label style={lbl}>
          Pot. Çerçeve
          <select value={potIv} onChange={e=>setPotIv(e.target.value)} style={sel}>
            <option value="1d">1D</option>
            <option value="12h">12h</option>
          </select>
        </label>

        <label style={lbl}>
          Min Potansiyel
          <select value={String(minPot)} onChange={e=>setMinPot(Number(e.target.value))} style={sel}>
            <option value="0.15">≥ %15</option>
            <option value="0.20">≥ %20</option>
            <option value="0.30">≥ %30</option>
          </select>
        </label>

        <label style={lbl}><input type="checkbox" checked={sameDir} onChange={e=>setSameDir(e.target.checked)} /> MTF aynı yön</label>

        <label style={lbl}>
          ATR k
          <select value={String(atrK)} onChange={e=>setAtrK(Number(e.target.value))} style={sel}>
            <option value="1.0">1.0</option>
            <option value="1.25">1.25</option>
            <option value="1.5">1.5</option>
            <option value="2.0">2.0</option>
          </select>
        </label>

        <label style={lbl}>
          Time-Stop
          <select value={String(timeStopMin)} onChange={e=>setTimeStopMin(Number(e.target.value))} style={sel}>
            <option value="30">30 dk</option>
            <option value="60">60 dk</option>
            <option value="90">90 dk</option>
          </select>
        </label>

        <button onClick={doScan} disabled={loading} style={btn}>
          {loading ? "Taranıyor…" : "Yenile"}
        </button>
      </div>

      {/* List */}
      <div style={{ border:"1px solid #25304a", borderRadius:12, overflow:"hidden", background:"#0f1320" }}>
        <div style={{
          display:"grid",
          gridTemplateColumns:"140px 110px 100px 1fr 230px",
          padding:"10px 12px",
          background:"#151b2c",
          color:"#a9b4c9",
          fontWeight:800
        }}>
          <div>Coin</div>
          <div>Yön</div>
          <div>Potansiyel</div>
          <div>Neden (kısa özet)</div>
          <div>Entry • SL • TP1/2/3</div>
        </div>

        {signals.length===0 ? (
          <div style={{ padding:"12px 14px", opacity:.75 }}>
            Filtreye uyan güçlü sinyal yok (seçimlerini değiştirip tekrar dene).
          </div>
        ) : signals.map(s=>{
          const col = s.dir==="LONG" ? "#22d39a" : "#ff6b6b";
          return (
            <div key={s.sym} style={{
              display:"grid",
              gridTemplateColumns:"140px 110px 100px 1fr 230px",
              padding:"10px 12px",
              borderTop:"1px solid #23283b",
              alignItems:"center"
            }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <Link href={`/coin/${s.sym}`} style={{ color:"#8bd4ff", fontWeight:900, textDecoration:"none" }}>
                  {s.sym}
                </Link>
                <span style={{ opacity:.7 }}>@ {fmt(s.price)}</span>
              </div>
              <div style={{ fontWeight:900, color:col }}>{s.dir}</div>
              <div style={{ fontWeight:900 }}>{fmt(s.potPct,0)}%</div>
              <div style={{ opacity:.95 }}>{s.reasons}</div>
              <div style={{ fontSize:12, lineHeight:1.3 }}>
                {s.entry && s.sl && s.tp1 ? (
                  <>
                    <div><b>Entry:</b> {fmt(s.entry, s.entry>=100?2:4)}</div>
                    <div><b>SL:</b> {fmt(s.sl, s.sl>=100?2:4)}</div>
                    <div><b>TP1/2/3:</b> {fmt(s.tp1, s.tp1>=100?2:4)} • {fmt(s.tp2, s.tp2>=100?2:4)} • {fmt(s.tp3, s.tp3>=100?2:4)}</div>
                    <div style={{opacity:.65}}>ATR(15m)×{s.atrK} ile otomatik. Time-Stop: {timeStopMin} dk (öneri)</div>
                  </>
                ) : (
                  <span style={{opacity:.6}}>ATR verisi yok → Entry/SL/TP hesaplanamadı</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ opacity:.6, marginTop:10, fontSize:12 }}>
        Kaynak: Binance Futures (miniTicker WS + indicators MTF + {potIv.toUpperCase()} potansiyel). Bu çıktı bilgi amaçlıdır, yatırım tavsiyesi değildir.
      </p>
    </main>
  );
}

// Live badge
function LiveDot(){
  return (
    <span style={{display:"inline-flex", alignItems:"center", gap:8}}>
      <span style={{
        width:10, height:10, borderRadius:999, background:"#22d39a",
        boxShadow:"0 0 0 0 rgba(34,211,154,.7)", animation:"pulse 1.5s infinite"
      }}/>
      <span style={{opacity:.8}}>Canlı</span>
      <style jsx>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(34,211,154,.7); }
          70% { box-shadow: 0 0 0 8px rgba(34,211,154,0); }
          100%{ box-shadow: 0 0 0 0 rgba(34,211,154,0); }
        }
      `}</style>
    </span>
  );
}

const lbl = { display:"inline-flex", alignItems:"center", gap:8, padding:"6px 10px", border:"1px solid #2a2f45", background:"#121625", borderRadius:8 };
const sel = { padding:"6px 8px", background:"#0f1320", border:"1px solid #23283b", borderRadius:8, color:"#e6e6e6" };
const btn = { padding:"8px 12px", background:"#1a1f2e", border:"1px solid #2a2f45", borderRadius:10, color:"#fff", fontWeight:700 };
