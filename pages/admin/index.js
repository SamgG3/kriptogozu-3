import { useEffect, useState } from "react";

export default function Admin() {
  const [data, setData] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const r = await fetch("/api/futures/indicators?symbol=BTCUSDT&interval=1m&limit=300");
        const json = await r.json();
        setData(json.latest);
      } catch (err) {
        console.error("Hata:", err);
      }
    }
    fetchData();
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "#0f1115", color: "#e6e6e6", padding: "24px", fontFamily: "system-ui" }}>
      <h1 style={{ color: "#59cfff" }}>KriptoGözü • Admin</h1>
      <h2>BTCUSDT (1m)</h2>

      {!data ? (
        <p>Yükleniyor...</p>
      ) : (
        <div style={{ marginTop: "20px", lineHeight: "1.8" }}>
          <p><b>Kapanış:</b> {data.close}</p>
          <p><b>EMA20:</b> {data.ema20}</p>
          <p><b>RSI(14):</b> {data.rsi14}</p>
          <p><b>Bollinger Üst:</b> {data.bbUpper}</p>
          <p><b>Bollinger Alt:</b> {data.bbLower}</p>
        </div>
      )}
    </main>
  );
}
