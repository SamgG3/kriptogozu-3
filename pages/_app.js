// pages/_app.js
import { useEffect } from "react";

// globals.css varsa yüklensin; yoksa hata vermesin
try { require("../styles/globals.css"); } catch {}

function Marquee({ text, position = "top" }) {
  const borderTop = position === "bottom" ? "1px solid #1f2742" : "none";
  const borderBottom = position === "top" ? "1px solid #1f2742" : "none";
  return (
    <div style={{ width:"100%", background:"#0f1424", borderTop, borderBottom, overflow:"hidden" }}>
      <div style={{
        whiteSpace:"nowrap", display:"inline-block", padding:"8px 0",
        animation:"scrollx 22s linear infinite", fontWeight:800, color:"#9bd0ff"
      }}>
        {text}&nbsp;&nbsp;{text}&nbsp;&nbsp;{text}&nbsp;&nbsp;{text}
      </div>
      <style jsx global>{`
        @keyframes scrollx { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        html, body, #__next { height: 100%; }
        body { margin:0; background:#0b1020; color:#e6edf6; }
      `}</style>
    </div>
  );
}

export default function MyApp({ Component, pageProps }) {
  useEffect(()=>{ try{ document.body.style.background = "#0b1020"; }catch{} },[]);
  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", background:"#0b1020" }}>
      {/* ÜST BANT */}
      <Marquee text="— TANRININ GÖZÜ - KRİPTONUN GÖZÜ —" position="top" />
      {/* İÇERİK */}
      <main style={{ flex:1 }}>
        <Component {...pageProps} />
      </main>
      {/* ALT BANT */}
      <Marquee
        text="--- Tanrının Gözü - Kriptonun Gözü --- Bu kanalda paylaşılanlar SPK kuralları gereğince KESİNLİKLE yatırım tavsiyesi değildir."
        position="bottom"
      />
    </div>
  );
}
