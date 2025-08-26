// pages/_app.js
import dynamic from "next/dynamic";
import { useEffect } from "react";

// globals.css yoksa sorun olmasın diye try/catch
try { require("../styles/globals.css"); } catch {}

// Varsa kullanılsın (opsiyonel)
const PriceBar = dynamic(() => import("../components/PriceBar").catch(() => null), { ssr: false });
const TopBar   = dynamic(() => import("../components/TopBar").catch(() => null),   { ssr: false });

function Marquee({ text, position = "top" }) {
  // position: "top" | "bottom" — sadece border için kullanıyoruz
  const borderTop = position === "bottom" ? "1px solid #1f2742" : "none";
  const borderBottom = position === "top" ? "1px solid #1f2742" : "none";
  return (
    <div
      style={{
        width: "100%",
        background: "#0f1424",
        borderTop,
        borderBottom,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          whiteSpace: "nowrap",
          display: "inline-block",
          padding: "8px 0",
          animation: "scrollx 22s linear infinite",
          fontWeight: 800,
          color: "#9bd0ff",
        }}
      >
        {text}&nbsp;&nbsp;{text}&nbsp;&nbsp;{text}&nbsp;&nbsp;{text}
      </div>

      {/* Global keyframes ve bazı güvenli resetler */}
      <style jsx global>{`
        @keyframes scrollx {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        html, body, #__next { height: 100%; }
        body { margin: 0; background: #0b1020; color: #e6edf6; }
      `}</style>
    </div>
  );
}

export default function MyApp({ Component, pageProps }) {
  const TOP_TEXT =
    "— TANRININ GÖZÜ - KRİPTONUN GÖZÜ —";
  const BOTTOM_TEXT =
    "--- Tanrının Gözü - Kriptonun Gözü --- Bu kanalda paylaşılanlar SPK kuralları gereğince KESİNLİKLE yatırım tavsiyesi niteliğinde değildir.";

  // güvenli: dark background
  useEffect(() => {
    try { document.body.style.background = "#0b1020"; } catch {}
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#0b1020",
      }}
    >
      {/* ÜST BANT (akış içinde – fixed/sticky değil) */}
      <Marquee text={TOP_TEXT} position="top" />

      {/* Üst kısımda kullanıyorsan */}
      {PriceBar ? <PriceBar /> : null}
      {TopBar ? <TopBar /> : null}

      {/* İÇERİK */}
      <main style={{ flex: 1 }}>
        <Component {...pageProps} />
      </main>

      {/* ALT BANT (akış içinde – her zaman en altta) */}
      <Marquee text={BOTTOM_TEXT} position="bottom" />
    </div>
  );
}
