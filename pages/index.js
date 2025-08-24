import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_SYMBOLS = "BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT,XRPUSDT,ADAUSDT,DOGEUSDT";

export default function Home() {
  const [symbols, setSymbols] = useState(DEFAULT_SYMBOLS);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const timerRef = useRef(null);

  const list = useMemo(
    () => symbols.split(",").map(s => s.trim().toUpperCase()).filter(Boolean),
    [symbols]
  );

  async function load() {
    try {
      setLoading(true); setErr(null);
      const qs = encodeURIComponent(list.join(","));
      const res = await fetch(`/api/futures/price?symbols=${qs}`, { cache: "no-store" });
      const json = await res.json();
      setData(json);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  // İlk açılış + her 10 sn'de bir yenile
  useEffect(() => {
    load(); // hemen çek
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(load, 10000); // 10s
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols]);

  return (
    <main style={{padding:"24px", fontFamily:"system-ui", color:"#e6e6e6", background:"#0f1115", minHeight:"100vh"}}>
      <h1 style={{color:"#59c1ff"}}>KriptoGözü • Binance Futures</h1>

      <div style={{marginTop:12, display:"flex", gap:8, flexWrap:"wrap"}}>
        <input
          value={symbols}
          onChange={(e)=>setSymbols(e.target.value)}
          placeholder="BTCUSDT,ETHUSDT,BNBUSDT"
          style={{flex:"1 1 420px", minWidth:280, padding:"10px 12px", background:"#121625", border:"1px solid #23283b", borderRadius:10, color:"#e6e6e6"}}
        />
        <button onClick={load} disabled={loading}
          style={{padding:"10px 14px", background:"#1a1f2e", border:"1px solid #2a2f45", borderRadius:10, color:"#fff", cursor:"pointer", fontWeight:600}}>
          {loading ? "Yükleniyor..." : "Manuel Yenile"}
        </button>
      </div>

      {err && (
        <div style={{marginTop:12, color:"#ffb4b4"}}>Hata: {String(err)}</div>
      )}

      <div style={{
        marginTop:16,
        display:"grid",
        gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))",
        gap:12
      }}>
        {list.map(sym => (
          <div key={sym} style={{background:"#151a2b", border:"1px solid #26304a", borderRadius:12, padding:12}}>
            <div style={{opacity:.8, marginBottom:6}}>{sym}</div>
            <div style={{fontSize:24, fontWeight:800}}>
              {data?.[sym] ?? "—"}
            </div>
            <div style={{fontSize:12, opacity:.6, marginTop:6}}>10 sn otomatik yenilenir</div>
          </div>
        ))}
      </div>

      <p style={{marginTop:14}}>
        <a href={`/api/futures/price?symbols=${encodeURIComponent(list.join(","))}`} style={{color:"#8bd4ff"}}>JSON’u gör</a>
      </p>
    </main>
  );
}





