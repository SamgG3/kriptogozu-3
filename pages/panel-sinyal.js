// pages/panel-sinyal.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

/* ==========================
   KULLANICI AYARLARI
   ========================== */

// Tarayacağımız semboller (isteğe göre artır/azalt)
// Not: Tam liste için buraya ekleyebilirsin; WS ve fetch paralel çalışır.
const SYMBOLS = [
  "BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","AVAXUSDT",
  "AAVEUSDT","ATOMUSDT","LINKUSDT","NEARUSDT","MATICUSDT","APTUSDT","SUIUSDT","ARBUSDT",
  "OPUSDT","FILUSDT","INJUSDT","TRXUSDT","DOTUSDT","ETCUSDT","RNDRUSDT","TIAUSDT",
  "PEPEUSDT","WIFUSDT","JUPUSDT","FTMUSDT","SEIUSDT","ICPUSDT","BLURUSDT","SANDUSDT",
  "THETAUSDT","CHZUSDT","EGLDUSDT","GALAUSDT","LTCUSDT","UNIUSDT","KASUSDT","TONUSDT"
];

// ATR çarpanı varsayılanı (TP/SL ve pozisyon boyutu için)
const DEFAULT_ATR_K = 1.5;

// Min potansiyel seçenekleri (bb/atr tabanlı)
const MIN_POT_OPTIONS = [10, 15, 20, 25, 30]; // yüzde

// WebSocket batch boyutu (tek bağlantıda çok stream)
const WS_BATCH = 40;

/* ==========================
   YARDIMCI FONKS.
   ========================== */

const clamp = (x,min,max)=> Math.max(min, Math.min(max,x));
const fmt = (v,d=2)=> v==null || isNaN(v) ? "—" :
  Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d, maximumFractionDigits:d});
const fmtPrice = (v)=>{
  if (v==null || isNaN(v)) return "—";
  const a = Math.abs(v);
  const d = a >= 100 ? 2 : a >= 1 ? 4 : 6;
  return Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d, maximumFractionDigits:d});
};
const pctTxt = (v)=> v==null || isNaN(v) ? "—" : (v>=0?"+":"") + Number(v).toFixed(2) + "%";

// Basit sinyal skoru (-100..+100), sonra 0..100 skora ölçekle
function biasScore(L){
  if (!L) return { dir: "NEUTRAL", score: 50, raw: 0, parts:{} };
  const { close, ema20, rsi14, stochK, stochD, bbUpper, bbLower } = L;

  const emaDist = (close!=null && ema20!=null) ? (close - ema20) / ema20 : 0;     // +/- oransal
  const rsiBias = (rsi14!=null) ? (rsi14 - 50) / 25 : 0;                            // -1..+1
  const stochBias = (stochK!=null && stochD!=null) ? (stochK - stochD) / 50 : 0;   // -1..+1
  let bandPos = 0;
  if (bbUpper!=null && bbLower!=null && close!=null && bbUpper>bbLower){
    const pos = (close - bbLower) / (bbUpper - bbLower); // 0..1
    bandPos = (pos - 0.5) * 2; // -1..+1
  }

  // Ağırlıklar
  const wEMA=0.35, wRSI=0.30, wSTO=0.20, wBB=0.15;
  const raw = clamp(wEMA*clamp(emaDist/0.03,-1,1) + wRSI*clamp(rsiBias,-1,1) + wSTO*clamp(stochBias,-1,1) + wBB*clamp(bandPos,-1,1), -1, 1);
  const score = Math.round((raw+1)*50); // 0..100
  const dir = raw>0.08 ? "LONG" : raw<-0.08 ? "SHORT" : "NEUTRAL";
  return { dir, score, raw, parts:{emaDist, rsiBias, stochBias, bandPos} };
}

// Risk etiketi (ATR veya BB genişliğine göre)
function riskLabel(L){
  const c=L?.close, atr=L?.atr14;
  if (c && atr){
    const p = atr/c;
    if (p < 0.008) return { txt:"Düşük", color:"#22d39a" };
    if (p < 0.02)  return { txt:"Orta",  color:"#f1c40f" };
    return { txt:"Yüksek", color:"#ff6b6b" };
  }
  const bu=L?.bbUpper, bl=L?.bbLower;
  if (c && bu!=null && bl!=null){
    const w = (bu-bl)/c;
    if (w < 0.01) return { txt:"Düşük", color:"#22d39a" };
    if (w < 0.03) return { txt:"Orta",  color:"#f1c40f" };
    return { txt:"Yüksek", color:"#ff6b6b" };
  }
  return { txt:"—", color:"#9aa4b2" };
}

// Entry/SL/TP hesaplayıcı (ATR yoksa BB fallback)
function calcPlan(dir, L, atrK=DEFAULT_ATR_K){
  const c = L?.close;
  if (!c) return null;

  let dist = null;
  if (L?.atr14) dist = atrK * L.atr14;
  // ATR yoksa BB fallback
  if (dist==null && L?.bbUpper!=null && L?.bbLower!=null){
    const w = (L.bbUpper - L.bbLower);
    if (w>0) dist = 0.25 * w; // bandın 1/4'ü kadar mesafe
  }
  if (!dist || dist<=0) return null;

  const entry = c;
  if (dir==="LONG"){
    const sl  = entry - dist;
    const tp1 = entry + 1*dist;
    const tp2 = entry + 1.5*dist;
    const tp3 = entry + 2*dist;
    return { entry, sl, tp1, tp2, tp3, r:dist };
  } else if (dir==="SHORT"){
    const sl  = entry + dist;
    const tp1 = entry - 1*dist;
    const tp2 = entry - 1.5*dist;
    const tp3 = entry - 2*dist;
    return { entry, sl, tp1, tp2, tp3, r:dist };
  }
  return null;
}

// Pozisyon boyutu (sermaye*risk / mesafe)
function positionSize(usd, riskPct, r){
  if (!usd || !riskPct || !r || r<=0) return 0;
  const riskUsd = usd * (riskPct/100);
  return riskUsd / r;
}

/* ==========================
   LOCAL "BAŞARI %" TAKİBİ
   ========================== */
// Kaydet: { sym, ts, dir, entry, sl, tp1,tp2,tp3, resolved: "TP1|TP2|TP3|SL" }
// Her çalıştırmada WS ile takip eder, dokununca işaretler.
const HIST_KEY = "kgz_sig_hist_v1";

function loadHist(){
  try { return JSON.parse(localStorage.getItem(HIST_KEY)||"[]"); } catch { return []; }
}
function saveHist(arr){
  try { localStorage.setItem(HIST_KEY, JSON.stringify(arr.slice(-200))); } catch {}
}
function histStatsFor(sym){
  const arr = loadHist().filter(x=>x.sym===sym);
  const total = arr.length || 0;
  if (!total) return { total: 0, tpHits: 0, slHits: 0, rate: 0 };
  const tpHits = arr.filter(x=>x.resolved && x.resolved.startsWith("TP")).length;
  const slHits = arr.filter(x=>x.resolved==="SL").length;
  const rate = Math.round((tpHits/total)*100);
  return { total, tpHits, slHits, rate };
}

/* ==========================
   ANA BİLEŞEN
   ========================== */

export default function PanelSinyal(){
  // Filtre/ayarlar
  const [easy, setEasy] = useState(true);
  const [tf3m, setTf3m] = useState(true);
  const [tf30m, setTf30m] = useState(true);
  const [tf4h, setTf4h] = useState(true);

  const [mtfAlign, setMtfAlign] = useState(true);
  const [regime, setRegime] = useState(true);
  const [squeeze, setSqueeze] = useState(true);

  const [bbMax, setBbMax] = useState(1.2); // %
  const [minPot, setMinPot] = useState(15); // %
  const [atrK, setAtrK]   = useState(DEFAULT_ATR_K);
  const [capital, setCapital] = useState(50); // USDT
  const [riskPct, setRiskPct] = useState(0.5); // %

  const [onlyFavs, setOnlyFavs] = useState(false);
  const [favs, setFavs] = useState([]); // localStorage <-> yıldız

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]); // tarama sonuçları (obj listesi)
  const [ws, setWs] = useState({});     // canlı fiyat/chg map
  const [scannedAt, setScannedAt] = useState(null);

  const favSet = useMemo(()=> new Set(favs), [favs]);
  useEffect(()=>{
    try { const arr = JSON.parse(localStorage.getItem("kgz_favs")||"[]"); if(Array.isArray(arr)) setFavs(arr); } catch {}
  },[]);
  useEffect(()=>{
    try { localStorage.setItem("kgz_favs", JSON.stringify(favs)); } catch {}
  },[favs]);

  // CANLI FİYAT WS (miniTicker)
  useEffect(()=>{
    const subs = [];
    // batch stream urls
    for (let i=0; i<SYMBOLS.length; i+=WS_BATCH){
      const pack = SYMBOLS.slice(i, i+WS_BATCH);
      const url = "wss://fstream.binance.com/stream?streams=" + pack.map(s=>`${s.toLowerCase()}@miniTicker`).join("/");
      const sock = new WebSocket(url);
      sock.onmessage = (ev)=>{
        try {
          const d = JSON.parse(ev.data)?.data;
          if (d?.s){
            const last = d?.c ? +d.c : null;
            const chg  = d?.P !== undefined ? +d.P : (d?.o && d?.c) ? ((+d.c - +d.o)/+d.o)*100 : null;
            setWs(prev=> ({ ...prev, [d.s]: { last, chg } }));
          }
        } catch {}
      };
      subs.push(sock);
    }
    return ()=> subs.forEach(s=>{ try{s.close();}catch{} });
  },[]);

  // INDICATOR FETCH
  async function fetchOne(sym, interval){
    try{
      const r = await fetch(`/api/futures/indicators?symbol=${sym}&interval=${interval}&limit=300`, { cache:"no-store" });
      return await r.json();
    }catch{ return null; }
  }

  function bbWidthPct(L){
    if (!L?.bbUpper || !L?.bbLower || !L?.close) return null;
    const w = (L.bbUpper - L.bbLower)/L.close;
    return w*100;
  }

  // sinyal üret
  function makeSignal(sym, data3m, data30m, data4h){
    const L3 = data3m?.latest || null;
    const L30= data30m?.latest || null;
    const L4 = data4h?.latest || null;

    if (!L3 && !L30 && !L4) return null;

    // skorlar
    const s3 = biasScore(L3);
    const s30= biasScore(L30);
    const s4 = biasScore(L4);

    // aktif TF'ler
    const act = [];
    if (tf3m && L3)  act.push(s3);
    if (tf30m && L30) act.push(s30);
    if (tf4h && L4)  act.push(s4);
    if (act.length===0) return null;

    // MTF aynı yön şartı
    if (mtfAlign){
      const longs = act.filter(a=>a.dir==="LONG").length;
      const shorts= act.filter(a=>a.dir==="SHORT").length;
      if (longs===0 && shorts===0) return null; // hepsi nötr
      if (!(longs===act.length || shorts===act.length)) return null; // karışık
    }

    // birleştirilmiş skor (ağırlık: 3m:0.5, 30m:0.35, 4h:0.15)
    const w3=0.5, w30=0.35, w4=0.15;
    let raw = 0, wsum=0;
    if (tf3m && s3)  { raw += s3.raw*w3;  wsum += w3; }
    if (tf30m && s30){ raw += s30.raw*w30; wsum += w30; }
    if (tf4h && s4)  { raw += s4.raw*w4;  wsum += w4; }
    raw = raw / (wsum || 1);
    const score = Math.round((clamp(raw,-1,1)+1)*50);
    const dir = raw>0.08 ? "LONG" : raw<-0.08 ? "SHORT" : "NEUTRAL";
    if (dir==="NEUTRAL") return null;

    // rejim (yan bantta işlem isteme)
    if (regime){
      const L = L30 || L3 || L4;
      if (L?.rsi14!=null && L?.rsi14>45 && L.rsi14<55) return null;
    }

    // sıkışma filtresi
    if (squeeze){
      const L = L30 || L3 || L4;
      const bw = bbWidthPct(L);
      if (bw!=null && bw > bbMax) return null;
    }

    // potansiyel: ATR veya BB üzerinden yüzde
    const Lref = L30 || L3 || L4;
    const c = Lref?.close;
    let potPct = null;
    if (c){
      if (Lref?.atr14){
        potPct = (DEFAULT_ATR_K * Lref.atr14) / c * 100 * 2; // ~2R hedef (kabaca)
      }else if (Lref?.bbUpper!=null && Lref?.bbLower!=null){
        potPct = ((Lref.bbUpper - Lref.bbLower)/c)*100; // band genişliğini potansiyel say
      }
    }
    if (potPct!=null && potPct < minPot) return null;

    // plan
    const plan = calcPlan(dir, L3 || L30 || L4, atrK);

    // risk etiketi
    const risk = riskLabel(L3 || L30 || L4);

    // kısa neden
    const why = [];
    if (tf3m && s3)  why.push(`3m ${s3.dir} (sk=${s3.score})`);
    if (tf30m && s30) why.push(`30m ${s30.dir} (sk=${s30.score})`);
    if (tf4h && s4)  why.push(`4h ${s4.dir} (sk=${s4.score})`);
    const reason = why.join(" • ");

    // kaynak metni
    const src = ["BB","MTF","ATR"];
    return {
      sym, dir, score, reason, plan, risk, potPct: potPct!=null ? Math.round(potPct) : null,
      src: src.join(", "),
    };
  }

  async function scan(){
    setLoading(true);
    try{
      const enable3 = tf3m, enable30=tf30m, enable4=tf4h;
      const promises = SYMBOLS.map(async (sym)=>{
        const [d3,d30,d4] = await Promise.all([
          enable3 ? fetchOne(sym,"3m") : null,
          enable30? fetchOne(sym,"30m"): null,
          enable4 ? fetchOne(sym,"4h") : null,
        ]);
        const sig = makeSignal(sym,d3,d30,d4);
        return sig;
      });
      const res = (await Promise.all(promises)).filter(Boolean);
      // favori filtresi
      const filtered = onlyFavs ? res.filter(r=>favSet.has(r.sym)) : res;
      // skor ile sırala
      filtered.sort((a,b)=> (b.score||0)-(a.score||0));
      setRows(filtered);
      setScannedAt(Date.now());
    } finally {
      setLoading(false);
    }
  }

  useEffect(()=>{ scan(); },[]);

  // websocket ile TP/SL takibi — ekranda görünenler için
  const watchers = useRef({});
  useEffect(()=>{
    const actSyms = rows.map(r=>r.sym);
    actSyms.forEach(sym=>{
      const key = sym;
      if (watchers.current[key]) return; // zaten takipte
      const url = `wss://fstream.binance.com/ws/${sym.toLowerCase()}@miniTicker`;
      const sock = new WebSocket(url);
      const my = { sock, last:null, plan:null, resolved:false };

      const row = rows.find(r=>r.sym===sym);
      my.plan = row?.plan;
      sock.onmessage = (ev)=>{
        if (my.resolved) return;
        try{
          const d = JSON.parse(ev.data);
          const c = d?.c ? +d.c : null;
          if (!c || !my.plan) return;
          const { entry, sl, tp1, tp2, tp3 } = my.plan;
          // long/short yönüne göre dokunuş kontrol
          if (row.dir==="LONG"){
            if (c <= sl){
              my.resolved = true; markResolved(sym, "SL", row.dir, my.plan);
            }else if (c >= tp3){
              my.resolved = true; markResolved(sym, "TP3", row.dir, my.plan);
            }else if (c >= tp2){
              // not final; yalnızca üst TP'ye yükselt
              markFloating(sym, "TP2", row.dir, my.plan);
            }else if (c >= tp1){
              markFloating(sym, "TP1", row.dir, my.plan);
            }
          }else if (row.dir==="SHORT"){
            if (c >= sl){
              my.resolved = true; markResolved(sym, "SL", row.dir, my.plan);
            }else if (c <= tp3){
              my.resolved = true; markResolved(sym, "TP3", row.dir, my.plan);
            }else if (c <= tp2){
              markFloating(sym, "TP2", row.dir, my.plan);
            }else if (c <= tp1){
              markFloating(sym, "TP1", row.dir, my.plan);
            }
          }
        }catch{}
      };
      watchers.current[key] = my;
    });

    return ()=>{
      Object.values(watchers.current).forEach(w=>{
        try{ w.sock && w.sock.close(); }catch{}
      });
      watchers.current = {};
    };
  },[rows]);

  function markFloating(sym, level, dir, plan){
    // sadece en yüksek TP seviyesini cache'e yaz; resolved yok
    const hist = loadHist();
    const idx = hist.findIndex(h=>!h.resolved && h.sym===sym && Math.abs(Date.now()-h.ts)<12*60*60*1000);
    if (idx<0){
      hist.push({ sym, ts: Date.now(), dir, entry: plan.entry, sl: plan.sl, tp1:plan.tp1,tp2:plan.tp2,tp3:plan.tp3, resolved: null, float: level });
    }else{
      hist[idx].float = level;
    }
    saveHist(hist);
  }
  function markResolved(sym, tag, dir, plan){
    const hist = loadHist();
    const idx = hist.findIndex(h=>!h.resolved && h.sym===sym && Math.abs(Date.now()-h.ts)<12*60*60*1000);
    if (idx<0){
      hist.push({ sym, ts: Date.now(), dir, entry: plan.entry, sl: plan.sl, tp1:plan.tp1,tp2:plan.tp2,tp3:plan.tp3, resolved: tag });
    }else{
      hist[idx].resolved = tag;
    }
    saveHist(hist);
  }

  // UI yardımcıları
  const countStr = useMemo(()=>{
    const t = SYMBOLS.length;
    const shown = rows.length;
    return `Tarandı: ${t}  •  Gösterilen: ${shown}  •  Son tarama: ${scannedAt ? new Date(scannedAt).toLocaleTimeString("tr-TR") : "-"}`;
  },[rows, scannedAt]);

  // Tooltip açıklamaları
  const SCORE_EXPL = "Skor: 0-100. 80-100 güçlü, 60-80 orta, 40-60 zayıf. MTF birleşik ağırlık: 3m(0.5), 30m(0.35), 4h(0.15).";
  const SRC_EXPL   = "Kaynak: BB (Bollinger), MTF (çoklu zaman farkı), ATR (volatilite / mesafe). Whale, OI, Funding ileride eklenecek.";

  return (
    <main style={{minHeight:"100vh", background:"#0f1320", color:"#e6f0ff", padding:"16px 18px", paddingBottom:72}}>
      {/* NAV */}
      <div style={{display:"flex", gap:10, alignItems:"center", marginBottom:10, flexWrap:"wrap"}}>
        <button onClick={()=> (history.length>1 ? history.back() : location.href="/")}
                style={btnSm} type="button">← Geri</button>
        <Link href="/" style={{color:"#8bd4ff", fontWeight:900, textDecoration:"none"}}>Kripto Gözü</Link>
        <Link href="/" style={navL}>Ana Sayfa</Link>
        <Link href="/panel" style={navL}>Panel</Link>
        <Link href="/whales" style={navL}>Balina</Link>
        <Link href="/balina2d" style={navL}>Balina2D</Link>
        <span style={{marginLeft:"auto", opacity:.8}}>TR / EN</span>
      </div>

      <h1 style={{margin:"4px 0 10px", display:"flex", alignItems:"center", gap:10}}>
        Panel – Sinyal (PRO)
        <span style={{width:8,height:8,borderRadius:10,background:"#22d39a"}} />
        <span style={{fontSize:12, opacity:.7}}>{countStr}</span>
        <button onClick={()=>setEasy(v=>!v)} style={pill}>
          {easy ? "Kolay Mod devrede" : "Detaylı Mod devrede"}
        </button>
      </h1>

      {/* FİLTRE BAR */}
      <div style={bar}>
        <div style={row}>
          <span>Mod</span>
          <SelectBox value={"gunici"} onChange={()=>{}}>
            <option value="gunici">Gün içi (5m+15m+1h)</option>
          </SelectBox>

          <Check label="3m" checked={tf3m} set={setTf3m}/>
          <Check label="30m" checked={tf30m} set={setTf30m}/>
          <Check label="4h" checked={tf4h} set={setTf4h}/>

          <span>Pot. Çerçeve</span>
          <SelectBox value={"12h"} onChange={()=>{}}>
            <option value="12h">12h</option>
          </SelectBox>

          <span>Min Potansiyel</span>
          <SelectBox value={minPot} onChange={(e)=>setMinPot(+e.target.value)}>
            {MIN_POT_OPTIONS.map(v=><option key={v} value={v}>{`≥ ${v}%`}</option>)}
          </SelectBox>

          <Check label="MTF aynı yön" checked={mtfAlign} set={setMtfAlign}/>
          <Check label="Rejim filtresi" checked={regime} set={setRegime}/>
          <Check label="Sıkışma" checked={squeeze} set={setSqueeze}/>
        </div>

        <div style={row}>
          <span>BB genişlik</span>
          <SelectBox value={bbMax} onChange={(e)=>setBbMax(+e.target.value)}>
            {[0.8,1.0,1.2,1.5,2.0].map(v=><option key={v} value={v}>{`≤ ${v}%`}</option>)}
          </SelectBox>

          <span>ATR k</span>
          <Num value={atrK} set={setAtrK} step={0.1} min={0.5}/>

          <span>Sermaye (USDT)</span>
          <Num value={capital} set={setCapital} step={10} min={0}/>

          <span>Risk %</span>
          <Num value={riskPct} set={setRiskPct} step={0.1} min={0} max={5}/>

          <Check label="Sadece Favoriler" checked={onlyFavs} set={setOnlyFavs}/>
          <button onClick={scan} disabled={loading} style={btnPrimary}>{loading?"Taranıyor…":"Yenile"}</button>
        </div>
      </div>

      {/* TABLO BAŞLIK */}
      <div style={thead}>
        <div>Coin</div>
        <div>Yön</div>
        <div title={SCORE_EXPL}>Skor ⓘ</div>
        <div>Başarı %</div>
        <div>neden (kısa özet)</div>
        {!easy && <div>Entry • SL • TP1/2/3</div>}
        <div>Önerilen Poz.</div>
        <div title={SRC_EXPL}>Kaynak ⓘ</div>
      </div>

      {/* SATIRLAR */}
      <div style={{border:"1px solid #1f2742", borderTop:"none", borderRadius:"0 0 12px 12px", overflow:"hidden"}}>
        {rows.map((r, i)=>{
          const price = ws[r.sym]?.last ?? r.plan?.entry ?? null;
          const chg   = ws[r.sym]?.chg ?? null;
          const fav   = favSet.has(r.sym);
          const plan  = r.plan;
          const pos   = plan ? positionSize(capital, riskPct, plan.r) : 0;
          const hs    = histStatsFor(r.sym); // local başarı
          return (
            <div key={r.sym} style={{
              display:"grid",
              gridTemplateColumns: easy
                ? "1.1fr 0.7fr 0.7fr 0.9fr 2.4fr 1.2fr 0.9fr"
                : "1.1fr 0.7fr 0.7fr 0.9fr 2.4fr 2.4fr 1.2fr 0.9fr",
              padding:"10px 12px",
              borderTop: i===0 ? "none" : "1px solid #1f2742",
              alignItems:"center",
              background: i%2 ? "#0f1329" : "#0e1226"
            }}>
              {/* Coin */}
              <div style={{display:"flex", alignItems:"center", gap:8}}>
                <button
                  title={fav ? "Favoriden çıkar" : "Favorilere ekle"}
                  onClick={()=> setFavs(p=> fav ? p.filter(x=>x!==r.sym) : [...p, r.sym])}
                  style={{background:"transparent", border:"none", fontSize:18, lineHeight:1, cursor:"pointer"}}>{fav?"★":"☆"}</button>
                <Link href={`/coin/${r.sym}`} style={{color:"#8bd4ff", fontWeight:800, textDecoration:"none"}}>{r.sym}</Link>
                <span style={{opacity:.65, fontSize:12}}>
                  @ {fmtPrice(price)} {chg!=null && <b style={{color: chg>=0?"#22d39a":"#ff6b6b"}}>{pctTxt(chg)}</b>}
                </span>
              </div>

              {/* Yön */}
              <div style={{fontWeight:900, color: r.dir==="LONG" ? "#22d39a" : "#ff6b6b"}}>{r.dir}</div>

              {/* Skor */}
              <div>{r.score}</div>

              {/* Başarı % (local) */}
              <div title={`Son ${hs.total} sinyal • TP:${hs.tpHits} / SL:${hs.slHits}`}>{hs.rate ? `${hs.rate}%` : "—"}</div>

              {/* Neden */}
              <div style={{opacity:.9}}>{r.reason}{r.potPct!=null && <span style={{opacity:.6}}> • Pot: ~{r.potPct}%</span>}</div>

              {/* Entry/SL/TP */}
              {!easy && (
                <div style={{fontSize:13}}>
                  {plan
                    ? (<span>
                        Entry <b>{fmtPrice(plan.entry)}</b> • SL <b>{fmtPrice(plan.sl)}</b> •
                        TP1 <b>{fmtPrice(plan.tp1)}</b> / TP2 <b>{fmtPrice(plan.tp2)}</b> / TP3 <b>{fmtPrice(plan.tp3)}</b>
                      </span>)
                    : (<span style={{opacity:.6}}>ATR/BB verisi yok – plan hesaplanamadı</span>)
                  }
                </div>
              )}

              {/* Önerilen pozisyon */}
              <div style={{fontSize:13}}>
                {plan
                  ? (<div>
                      {pos>0
                        ? <span>Boyut: <b>{fmt(pos,3)}</b> adet • Risk: ~<b>{fmt(capital*(riskPct/100),2)} USDT</b> • <span style={{color:r.risk.color}}>{r.risk.txt}</span></span>
                        : <span style={{opacity:.6}}>Sermaye/Risk/ATR yetersiz</span>
                      }
                    </div>)
                  : <span style={{opacity:.6}}>Plan yok</span>
                }
              </div>

              {/* Kaynak */}
              <div style={{opacity:.9}}>{r.src}</div>
            </div>
          );
        })}

        {rows.length===0 && (
          <div style={{padding:"16px 12px", opacity:.7}}>
            Şu an kriterlere uyan sinyal yok. Filtreleri gevşetip tekrar deneyebilirsin.
          </div>
        )}
      </div>
    </main>
  );
}

/* ==========================
   KÜÇÜK BİLEŞENLER
   ========================== */

function Check({label, checked, set}){
  return (
    <label style={{display:"inline-flex", alignItems:"center", gap:6}}>
      <input type="checkbox" checked={checked} onChange={e=>set(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
function SelectBox({value, onChange, children}){
  return (
    <select value={value} onChange={onChange} style={selectCss}>{children}</select>
  );
}
function Num({value, set, step=1, min, max}){
  return (
    <input type="number" value={value} onChange={e=>set(+e.target.value)}
           step={step} min={min} max={max} style={numCss}/>
  );
}

/* ==========================
   STYLES
   ========================== */

const navL = { color:"#c9d2ea", textDecoration:"none" };
const btnSm = {
  padding:"6px 10px", background:"#151b2c", border:"1px solid #1f2742",
  borderRadius:8, color:"#e6f0ff", cursor:"pointer"
};
const btnPrimary = {
  padding:"8px 12px", background:"#1a223c", border:"1px solid #2a3556",
  borderRadius:10, color:"#fff", fontWeight:800, cursor:"pointer"
};
const pill = {
  padding:"4px 8px", borderRadius:999, background:"#152042",
  border:"1px solid #26345c", color:"#9bd0ff", cursor:"pointer", fontSize:12
};
const bar = {
  border:"1px solid #1f2742", borderRadius:12, padding:"10px 12px",
  marginBottom:10, background:"#0e1426"
};
const row = { display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", margin:"6px 0" };
const thead = {
  display:"grid",
  gridTemplateColumns:"1.1fr 0.7fr 0.7fr 0.9fr 2.4fr 2.4fr 1.2fr 0.9fr",
  padding:"10px 12px",
  background:"#0e1424",
  border:"1px solid #1f2742",
  borderRadius:"12px 12px 0 0",
  color:"#a9b4c9",
  fontWeight:800
};
const selectCss = {
  padding:"6px 10px", background:"#121a34", border:"1px solid #243156",
  borderRadius:8, color:"#fff"
};
const numCss = {
  width:90, padding:"6px 10px", background:"#121a34", border:"1px solid #243156",
  borderRadius:8, color:"#fff"
};
