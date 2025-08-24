function CoinCard({ sym, row }) {
  const L = row?.latest || {};
  const close = L.close;

  // AI bias (aynı fonksiyon yukarıda duruyor)
  const { longPct, shortPct } = biasFromLatest(L);
  const signal = longPct >= 55 ? "AL" : shortPct >= 55 ? "SAT" : "NÖTR";
  const color  = signal === "AL" ? "#20c997" : signal === "SAT" ? "#ff6b6b" : "#89a";
  const border = signal === "AL" ? "#1f7a4f" : signal === "SAT" ? "#7a2e2e" : "#2a2f45";

  return (
    <Link href={`/coin/${sym}`} legacyBehavior>
      <a style={{ textDecoration: "none" }}>
        <div style={{
          background:"#151a2b",
          border:`1px solid ${border}`,
          borderRadius:12,
          padding:14,
          display:"grid",
          gridTemplateColumns:"1fr auto",
          alignItems:"center",
          gap:10,
          minHeight:86
        }}>
          {/* Sol kısım: Sembol + Fiyat */}
          <div style={{display:"grid", gap:4}}>
            <div style={{fontWeight:800, fontSize:18, color:"#8bd4ff"}}>{sym}</div>
            <div style={{opacity:.85}}>
              Son Fiyat: <b>{fmtPrice(close)}</b>
            </div>
          </div>

          {/* Sağ kısım: AI etiketi + Long/Short yüzdeleri */}
          <div style={{textAlign:"right"}}>
            <div style={{fontWeight:800, color}}>{signal}</div>
            <div style={{opacity:.9, marginTop:4}}>
              <span style={{color:"#20c997", fontWeight:700}}>Long {fmt(longPct,0)}%</span>
              <span style={{opacity:.7}}> / </span>
              <span style={{color:"#ff6b6b", fontWeight:700}}>Short {fmt(shortPct,0)}%</span>
            </div>
            <div style={{opacity:.6, fontSize:12, marginTop:6}}>Tıkla → detay</div>
          </div>
        </div>
      </a>
    </Link>
  );
}


