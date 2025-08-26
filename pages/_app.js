// pages/_app.js
import { useEffect } from "react";
try { require("../styles/globals.css"); } catch {}

function Marquee({ text, top=false }) {
  return (
    <div style={{
      position: "sticky",
      top: top ? 0 : "auto",
      bottom: top ? "auto" : 0,
      zIndex: 50,
      width: "100%",
      background: "#0f1424",
      borderBottom: top ? "1px solid #1f2742" : "none",
      borderTop: top ? "none" : "1px solid #1f2742",
      overflow: "hidden"
    }}>
      <div style={{
        whiteSpace: "nowrap",
        display: "inline-block",
        padding: "8px 0",
        animation: "scrollx 22s linear infinite",
        fontWeight: 800,
        color: "#9bd0ff"
      }}>
        {text}&nbsp;&nbsp;{text}&nbsp;&nbsp;{text}&nbsp;&nbsp;{text}
      </div>
      <style jsx global>{`
        @keyframes scrollx {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        body { background:#0b1020; }
      `}</style>
    </div>
  );
}

export default function MyApp({ Component, pageProps }) {
  const topText = "— TANRININ GÖZÜ - KRİPTONUN GÖZÜ —";
  const bottomText = "--- Tanrının Gözü - Kriptonun Gözü --- Bu kanalda paylaşılanlar SPK kuralları gereğince KESİNLİKLE yatırım tavsiyesi niteliğinde değildir.";

  useEffect(()=>{ try{ document.body.style.background = "#0b1020"; }catch(e){} },[]);

  return (
    <>
      <Marquee text={topText} top />
      <Component {...pageProps} />
      <Marquee text={bottomText} />
    </>
  );
}
