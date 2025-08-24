// pages/index.js
import dynamic from "next/dynamic";

// RealtimePanel bileşenini SSR kapalı şekilde dinamik içe aktarıyoruz
// (WebSocket ve window kullandığı için Pages Router'da güvenli yol)
const RealtimePanel = dynamic(() => import("../components/RealtimePanel"), {
  ssr: false,
});

export default function Home() {
  // Panelde göstermek istediğin semboller (Binance Futures USDT-M)
  const symbols = [
    "BTCUSDT",
    "ETHUSDT",
    "BNBUSDT",
    "SOLUSDT",
    "XRPUSDT",
    "ADAUSDT",
    "DOGEUSDT",
  ];

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0b0b0f",
        color: "#fff",
        padding: "20px",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
          KriptoGözü • Genel Panel
        </h1>
        <span style={{ opacity: 0.7, fontSize: 14 }}>
          (coin’e tıklayınca detay açılacak)
        </span>
      </header>

      <RealtimePanel
        symbols={symbols}
        staleAfterMs={5000}           // 5 sn güncellenmezse “Eski veri” uyarısı
        longShortFetchEveryMs={30000} // 30 sn’de bir long/short oranı çek
        onOpenDetails={(symbol) => {
          // Coin kartına tıklanınca detay sayfasına yönlendir
          // (Senin daha önce kullandığın /coin/[symbol] yapısına uyumludur)
          window.location.href = `/coin/${symbol}`;
        }}
      />
    </main>
  );
}




