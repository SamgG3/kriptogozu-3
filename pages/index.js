import { useEffect, useState } from "react";

export default function Home() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function load() {
    try {
      setLoading(true); setErr(null);
      const res = await fetch("/api/futures/price?symbols=BTCUSDT,ETHUSDT");
      const json = await res.json();
      setData(json);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <main style={{padding:"24px", fontFamily:"system-ui", color:"#e6e6e6", background:"#0f1115", minHeight:"100vh"}}>
      <h1 style={{color:"#59c1ff"}}>KriptoGözü • Binance Futures</h1>
      <p>API test: <code>/api/futures/price?symbols=BTCUSDT,ETHUSDT</code></p>

      <div style={{marginTop:16}}>
        <button onClick={load} disabled={loading}
          style={{padding:"8px 12px", borderRadius:8, border:"1px solid #2a2f45", background:"#1a1f2e", color:"#fff", cursor:"pointer"}}>
          {loading ? "Yükleniyor..." : "Fiyatları Yenile"}
        </button>
      </div>

      <pre style={{marginTop:16, background:"#121625", padding:12, borderRadius:8, border:"1px solid #23283b"}}>
        {err ? `Hata: ${err}` : (data ? JSON.stringify(data, null, 2) : "Veri yok")}
      </pre>

      {data && (
        <div style={{marginTop:12, display:"flex", gap:16}}>
          <div style={{padding:12, background:"#151a2b", border:"1px solid #26304a", borderRadius:10}}>
            <div>BTCUSDT</div>
            <div style={{fontSize:24, fontWeight:700}}>{data.BTCUSDT}</div>
          </div>
          <div style={{padding:12, background:"#151a2b", border:"1px solid #26304a", borderRadius:10}}>
            <div>ETHUSDT</div>
            <div style={{fontSize:24, fontWeight:700}}>{data.ETHUSDT}</div>
          </div>
        </div>
      )}
    </main>
  );
}


