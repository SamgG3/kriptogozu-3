// pages/_app.js
import { useEffect } from "react";
import dynamic from "next/dynamic";
try { require("../styles/globals.css"); } catch {}

// Daha önce yaptığımız bileşen varsa kullan
const PriceBar    = dynamic(() => import("../components/PriceBar").catch(()=>null),    { ssr:false });
const TopBar      = dynamic(() => import("../components/TopBar").catch(()=>null),      { ssr:false });
const WhaleTicker = dynamic(() => import("../components/WhaleTicker").catch(()=>null), { ssr:false });

// Basit dahili marquee (WhaleTicker yoksa fall-back)
function Marquee({ text }) {
  return (
    <div style={{ position:"sticky", top:0, zIndex:50, width:"100%", background:"#0f1424", borderBottom:"1px solid #1f2742", overflow:"hidden" }}>
      <div style={{
        whiteSpace:"nowrap",
        display:"inline-block",
        padding:"8px 0",
        animation:"scrollx 20s linear infinite",
        fontWeight:800,
        color:"#9bd0ff"
      }}>
        {text}&nbsp;&nbsp;{text}&nbsp;&nbsp;{text}&nbsp;&nbsp;{text}
      </div>
      <style jsx global>{`
        @keyframes scrollx {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

export default function MyApp({ Component, pageProps }) {
  const topText = "— TANRININ GÖZÜ - KRİPTONUN GÖZÜ —";
  const bottomText = "--- Tanrının Gözü - Kriptonun Gözü --- Bu kanalda paylaşılanlar SPK kuralları gereğince KESİNLİKLE yatırım tavsiyesi niteliğinde değildir.";

  // body arka plan uyumu
  useEffect(()=>{ try{ document.body.style.background = "#0b1020"; }catch(e){} },[]);

  return (
    <>
      {/* ÜST BANT */}
      {WhaleTicker ? (
        <WhaleTicker enabled={false} staticText={topText} />
      ) : (
        <Marquee text={topText} />
      )}

      {PriceBar ? <PriceBar /> : null}
      {TopBar ? <TopBar /> : null}

      <Component {...pageProps} />

      {/* ALT BANT */}
      {WhaleTicker ? (
        <WhaleTicker enabled={false} staticText={bottomText} />
      ) : (
        <Marquee text={bottomText} />
      )}
    </>
  );
}
