import { useEffect, useRef, useState } from "react";

const INTERVALS = ["1m", "5m", "15m", "1h", "4h"];

const fmt = (n, d=2) => (n==null || isNaN(n)) ? "—" : Number(n).toLocaleString("tr-TR",{minimumFractionDigits:d,maximumFractionDigits:d});
const pct = (n, d=2) => (n==null || isNaN(n)) ? "—" : (n>=0?"+":"") + Number(n).toFixed(d) + "%";

export default function Admin(){
  const [symbol, setSymbol]   = useState("BTCUSDT");
  const [interval, setInterval] = useState("1m");
  const [latest, setLatest]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto]       = useState(true);
  const [err, setErr]         = useState(null);

  // trade plan
  const [entry, setEntry] = useState("");
  const [stop, setStop]   = useState("");
  const [t1, setT1]       = useState("");
  const [t2, setT2]       = useState("");

  const timer = useRef(null);

  async function load(){
    try{
      setLoading(true); setErr(null);
      const r = await fetch(`/api/futures/indicators?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=300`, { cache:"no-store" });
      const j = await r.json();
      setLatest(j.latest || null);
    }catch(e){ setErr(String(e)); }
    finally{ setLoading(false); }
  }

  useEffect(()=>{ load(); }, [symbol, interval]);
  useEffect(()=>{
    if(timer.current) clearInterval(timer.current);
    if(auto) timer.current = setInterval(load, 10000);
    return ()=> timer.current && clearInterval(timer.current);
  }, [auto, symbol, interval]);

  // hesaplamalar (yorum & oranlar)
  const close = latest?.close, ema20 = latest?.ema20, rsi14 = latest?.rsi14;
  const bbU = latest?.bbUpper, bbL = latest?.bbLower, stochK = latest?.stochK, stochD = latest?.stochD;
  const distEmaPct   = (close!=null && ema20!=null) ? ((close-ema20)/ema20*100) : null;
  const bandPosPct   = (bbU!=null && bbL!=null && close!=null) ? ((close-bbL)/(bbU-bbL)*100) : null; // 0 alt, 100 üst
  const bandWidthPct = (bbU!=null && bbL!=null && close!=null) ? ((bbU-bbL)/close*100) : null;
  const rsiLabel = rsi14==null ? "—" : rsi14>=70 ? "Aşırı Alım" : rsi14<=30 ? "Aşırı Satım" : "Nötr";
  const stochLabel = (stochK!=null && stochD!=null) ? (stochK>stochD ? "K>%D (yukarı)" : "K<%D (aşağı)") : "—";

  // trade plan (RR)
  const f = (x)=> (x==="" ? null : Number(x));
  const E = f(entry), S = f(stop), T1 = f(t1), T2 = f(t2);
  const riskPct = (E!=null && S!=null) ? ((E-S)/E*100) : null;
  const rr1 = (E!=null && S!=null && T1!=null) ? ((T1-E)/(E-S)) : null;
  const rr2 = (E!=null && S!=null && T2!=null) ? ((T2-E)/(E-S)) : null;

  const tvUrl = `https://www.tradingview.com/chart/?symbol=BINANCE:${encodeURIComponent(symbol)}`;

  return (
    <main style={{minHeight:"100vh", background:"#0f1115", color:"#e6e6e6", fontFamily:"system-ui"}}>
      {/* NAV */}
      <nav style={{display:"flex", alignItems:"center", gap:16, padding:"16px 24px", borderBottom:"1px solid #23283b"}}>
        <a href="/" style={{color:"#8bd4ff", fontWeight:700}}>Ana Sayfa</a>
        <span style={{opacity:.7}}>›</span>
        <span style={{color:"#59c1ff", fontWeight:800}}>İndikatörler</span>
        <a href={tvUrl} target="_blank" rel="noreferrer" style={{marginLeft:"auto", color:"#8bd4ff"}}>TradingView’da aç →</a>
      </nav>

      {/* Kontroller */}
      <div style={{display:"flex", gap:12, flexWrap:"wrap", padding:"16px 24px"}}>
        <input value={symbol} onChange={e=>setSymbol(e.target.value.toUpperCase())}
          placeholder="BTCUSDT"
          style={{padding:"10px 12px", background:"#121625", border:"1px solid #23283b", borderRadius:10, color:"#e6e6e6"}} />
        <select value={interval} onChange={e=>setInterval(e.target.value)}
          style={{padding:"10px 12px", background:"#121625", border:"1px solid #23283b", borderRadius:10, color:"#e6e6e6"}}>
          {INTERVALS.map(iv => <option key={iv} value={iv}>{iv}</option>)}
        </select>
        <button onClick={load} disabled={loading}
          style={{padding:"10px 14px", background:"#1a1f2e", border:"1px solid #2a2f45", borderRadius:10, color:"#fff", fontWeight:700, cursor:"pointer"}}>
          {loading ? "Yükleniyor..." : "Yenile"}
        </button>
        <label style={{display:"flex", alignItems:"center", gap:8}}>
          <input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/> 10 sn’de bir otomatik yenile
        </label>
      </div>

      {err && <div style={{color:"#ffb4b4", padding:"0 24px 8px"}}>Hata: {err}</div>}

      {/* Kartlar */}
      <section style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:12, padding:"0 24px 24px"}}>
        <Card title={`${symbol} (${interval})`} value={fmt(close)} sub="Son Kapanış"/>
        <Card title="EMA20" value={fmt(ema20)} sub={`Fiyat/EMA: ${pct(distEmaPct)}`} highlight={distEmaPct!=null && Math.abs(distEmaPct)>=1}/>
        <Card title="RSI(14)" value={fmt(rsi14)} sub={rsiLabel} highlight={rsi14!=null && (rsi14<=30 || rsi14>=70)}/>
        <Card title="StochRSI %K" value={fmt(stochK)} sub={stochLabel}/>
        <Card title="StochRSI %D" value={fmt(stochD)} sub="3-periyot SMA"/>
        <Card title="Bollinger Üst" value={fmt(bbU)} sub={`Bant gen.: ${pct(((bbU??0)-(bbL??0)) / (close??1) * 100)}`}/>
        <Card title="Bollinger Alt" value={fmt(bbL)} sub={`Banttaki konum: ${pct(bandPosPct)}`}/>
      </section>

      {/* Sistem yorumu */}
      <section style={{padding:"0 24px 24px"}}>
        <div style={{background:"#151a2b", border:"1px solid #26304a", borderRadius:12, padding:14}}>
          <div style={{opacity:.8, marginBottom:6}}>Sistem Yorumu</div>
          <div style={{fontWeight:700}}>
            {close>ema20 ? "Kısa vadede fiyat EMA20 üstünde (pozitif eğilim)." : "Kısa vadede fiyat EMA20 altında (negatif eğilim)."}
            {" "}RSI: {rsiLabel}.{" "}
            {stochK!=null && stochD!=null ? (stochK>stochD ? "StochRSI yukarı kesişim eğiliminde." : "StochRSI aşağı kesişim eğiliminde.") : ""}
            {" "}{bandPosPct!=null ? `Bollinger konumu: ${pct(bandPosPct)} (0=alt, 100=üst).` : ""}
          </div>
        </div>
      </section>

      {/* Trade Planı: Giriş/Stop/Target */}
      <section style={{padding:"0 24px 48px"}}>
        <h3>Trade Planı</h3>
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))", gap:12}}>
          <Input label="Entry (Giriş)" value={entry} onChange={setEntry} placeholder={close ?? ""}/>
          <Input label="Stop" value={stop} onChange={setStop}/>
          <Input label="Target 1" value={t1} onChange={setT1}/>
          <Input label="Target 2" value={t2} onChange={setT2}/>
        </div>
        <div style={{marginTop:12, display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:12}}>
          <Card title="Risk %" value={pct(riskPct)} sub="(Entry-Stop) / Entry"/>
          <Card title="RR (T1)" value={rr1==null ? "—" : rr1.toFixed(2) + "R"} sub="(T1-Entry)/(Entry-Stop)"/>
          <Card title="RR (T2)" value={rr2==null ? "—" : rr2.toFixed(2) + "R"} sub="(T2-Entry)/(Entry-Stop)"/>
        </div>
      </section>
    </main>
  );
}

function Card({ title, value, sub, highlight }) {
  return (
    <div style={{
      background:"#151a2b",
      border:`1px solid ${highlight ? "#3ea76a" : "#26304a"}`,
      borderRadius:12,
      padding:14
    }}>
      <div style={{opacity:.8, marginBottom:6}}>{title}</div>
      <div style={{fontSize:24, fontWeight:800}}>{value}</div>
      <div style={{fontSize:12, opacity:.7, marginTop:6}}>{sub}</div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder }) {
  return (
    <label style={{display:"grid", gap:6}}>
      <span style={{opacity:.8}}>{label}</span>
      <input
        value={value}
        onChange={e=>onChange(e.target.value)}
        placeholder={placeholder}
        inputMode="decimal"
        style={{padding:"10px 12px", background:"#121625", border:"1px solid #23283b", borderRadius:10, color:"#e6e6e6"}}
      />
    </label>
  );
}


