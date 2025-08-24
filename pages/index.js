// Sunucuda fiyatları çekip ilk yüklemede ekrana basar (JS'e gerek kalmaz)
export async function getServerSideProps({ req }) {
  const base = `https://${req.headers.host}`;
  const res = await fetch(`${base}/api/futures/price?symbols=BTCUSDT,ETHUSDT`);
  const data = await res.json();
  return { props: { data } };
}

export default function Home({ data }) {
  return (
    <main style={{padding:"24px", fontFamily:"system-ui", color:"#e6e6e6", background:"#0f1115", minHeight:"100vh"}}>
      <h1 style={{color:"#59c1ff"}}>KriptoGözü • Binance Futures</h1>
      <p>API test: <code>/api/futures/price?symbols=BTCUSDT,ETHUSDT</code></p>

      <div style={{marginTop:16, display:"flex", gap:16}}>
        <div style={{padding:12, background:"#151a2b", border:"1px solid #26304a", borderRadius:10}}>
          <div>BTCUSDT</div>
          <div style={{fontSize:24, fontWeight:700}}>{data?.BTCUSDT ?? "-"}</div>
        </div>
        <div style={{padding:12, background:"#151a2b", border:"1px solid #26304a", borderRadius:10}}>
          <div>ETHUSDT</div>
          <div style={{fontSize:24, fontWeight:700}}>{data?.ETHUSDT ?? "-"}</div>
        </div>
      </div>

      <p style={{marginTop:16}}>
        <a href="/api/futures/price?symbols=BTCUSDT,ETHUSDT" style={{color:"#8bd4ff"}}>JSON’u gör</a> •
        <a href="/" style={{marginLeft:8, color:"#8bd4ff"}}>Yenile</a>
      </p>
    </main>
  );
}



