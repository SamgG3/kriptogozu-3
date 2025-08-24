import { useEffect, useRef, useState } from "react";

const INTERVALS = ["1m", "5m", "15m", "1h", "4h"];
const fmt = (n,d=2)=> (n==null||isNaN(n))?"—":Number(n).toLocaleString("tr-TR",{minimumFractionDigits:d,maximumFractionDigits:d});
const pct = (n,d=2)=> (n==null||isNaN(n))?"—":(n>=0?"+":"")+Number(n).toFixed(d)+"%";

export default function Admin(){
  const [symbol, setSymbol] = useState("BTCUSDT");
  // EN ÖNEMLİ DÜZELTME: setInterval ismi ÇAKIŞMASIN diye iv/setIv kullanıyoruz
  const [iv, setIv] = useState("1m");

  const [latest, setLatest] = useState(null);
  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const [err, setErr] = useState(null);

  // trade plan
  const [entry, setEntry] = useState("");
  const [stop, setStop]   = useState("");
  const [t1, setT1]       = useState("");
  const [t2, setT2]       = useState("");

  const timer = useRef(null);

  async function load(){
    try{
      setLoading(true); setErr(null);
      const r = await fetch(`/api/futures/indicators?symbol=${encodeURIComponent(symbol)}&interval=${iv}&limit=300&series=1`, { cache:"no-store" });
      const j = await r.json();
      setLatest(j.latest || null);
      setSeries(j.series || null);
    }catch(e){ setErr(String(e)); }
    finally{ setLoading(false); }
  }

  useEffect(()=>{ load(); }, [symbol, iv]);

  useEffect(()=>{
    // EN ÖNEMLİ DÜZELTME: tarayıcı setInterval’ı açıkça kullan
    if (timer.current) clearInterval(timer.current);
    if (auto) timer.current = window.setInterval(load, 10000);
    return ()=> { if (timer.current) clearInterval(timer.current); };
  }, [auto, symbol, iv]);

  const c  = latest?.close, e20 = latest?.ema20, r14 = latest?.rsi14;
  const bu = latest?.bbUpper, bl = latest?.bbLower, k = latest?.stochK, d = latest?.stochD;

  const distEmaPct   = (c!=null&&e20!=null)?((c-e20)/e20*100):null;
  const bandPosPct   = (bu!=null&&bl!=null&&c!=null)?((c-bl)/(bu-bl)*100):null;
  const bandWidthPct = (bu!=null&&bl!=null&&c!=null)?((bu-bl)/c*100):null;

  const rsiLabel   = r14==null ? "—" : r14>=70 ? "Aşırı Alım" : r14<=30 ? "Aşırı Satım" : "Nötr";
  const stochLabel = (k!=null&&d!=null)?(k>d?"K>%D (yukarı)":"K<%D (aşağı)"):"—";

  // Basit sinyal (bilgilendirme)
  let signal = "Nötr";
  if (k!=null && d!=null) {
    if (k>d && c>e20 && r14<65) signal = "AL olasılığı ↑";
    if (k<d && c<e20 && r14>35) signal = "SAT olasılığı ↓";
  }
  if (bandPosPct!=null) {
    if (bandPosPct >= 90) signal += " • Üst banda yakın";
    if (bandPosPct <= 10) signal += " • Alt banda yakın";
  }

  // Trade plan RR
  const toNum = (x)=> x==="" ? null : Number(x);
  const E = toNum(entry), S = toNum(stop), T1 = toNum(t1), T2 = toNum(t2);
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
        <select value={iv} onChange={e=>setIv(e.target.value)}
          style={{padding:"10px 12px", background:"#121625", border:"1px solid #23283b", borderRadius:10, color:"#e6e6e6"}}>
          {INTERVALS.map(x => <option key={x} value={x}>{x}</option>)}
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
        <Card title={`${symbol} (${iv})`} value={fmt(c)} sub="Son Kapanış"/>
        <Card title="EMA20" value={fmt(e20)} sub={`Fiyat/EMA: ${pct(distEmaPct)}`} highlight={distEmaPct!=null && Math.abs(distEmaPct)>=1}/>
        <Card title="RSI(14)" value={fmt(r14)} sub={rsiLabel} highlight={r14!=null && (r14<=30 || r14>=70)}/>
        <Card title="StochRSI %K" value={fmt(k)} sub={stochLabel}/>
        <Card title="StochRSI %D" value={fmt(d)} sub="3-periyot SMA"/>
        <Card title="Bollinger Üst" value={fmt(bu)} sub={`Bant gen.: ${pct(bandWidthPct)}`}/>
        <Card title="Bollinger Alt" value={fmt(bl)} sub={`Banttaki konum: ${pct(bandPosPct)}`}/>
        <Card title="Sinyal" value={signal} sub="(bilgilendirme)"/>
      </section>

      {/* Mini Grafik */}
      <section style={{padding:"0 24px 24px"}}>
        <div style={{background:"#151a2b", border:"1px solid #26304a", borderRadius:12, padding:14}}>
          <div style={{opacity:.8, marginBottom:6}}>Mini Grafik (son ~120 bar)</div>
          <MiniChart series={series}/>
        </div>
      </section>

      {/* Trade Planı */}
      <section style={{padding:"0 24px 48px"}}>
        <h3>Trade Planı</h3>
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))", gap:12}}>
          <Input label="Entry (Giriş)" value={entry} onChange={setEntry} placeholder={c ?? ""}/>
          <Input label="Stop" value={stop} onChange={setStop}/>
          <Input label="Target 1" value={t1} onChange={setT1}/>
          <Input label="Target 2" value={t2} onChange={setT2}/>
        </div>

        {/* RR ve Risk hesaplarını düzgün hesapla */}
        <div style={{marginTop:12, display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:12}}>
          <Card title="Risk %" value={pct(riskPct)} sub="(Entry-Stop) / Entry"/>
          <Card title="RR (T1)" value={rr1==null?"—":rr1.toFixed(2)+"R"} sub="(T1-Entry)/(Entry-Stop)"/>
          <Card title="RR (T2)" value={rr2==null?"—":rr2.toFixed(2)+"R"} sub="(T2-Entry)/(Entry-Stop)"/>
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
function MiniChart({ series }) {
  if (!series) return <div>Yükleniyor…</div>;
  const { closes, ema20, bbUpper, bbLower } = series;
  const W = 920, H = 220, P = 12;
  const vals = [...closes, ...ema20.filter(Boolean), ...bbUpper.filter(Boolean), ...bbLower.filter(Boolean)];
  const min = Math.min(...vals), max = Math.max(...vals);
  const x = (i)=> P + i * ((W - 2*P) / (closes.length - 1));
  const y = (v)=> H - P - ((v - min) / (max - min)) * (H - 2*P);
  const path = (arr)=> arr.map((v,i)=> v==null?null:`${i===0?"M":"L"} ${x(i)} ${y(v)}`).filter(Boolean).join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      <path d={path(bbUpper)} stroke="#5a6b9a" fill="none" strokeWidth="1.2"/>
      <path d={path(bbLower)} stroke="#5a6b9a" fill="none" strokeWidth="1.2"/>
      <path d={path(ema20)} stroke="#f2c94c" fill="none" strokeWidth="1.5"/>
      <path d={path(closes)} stroke="#20b7ff" fill="none" strokeWidth="1.3"/>
    </svg>
  );
}




