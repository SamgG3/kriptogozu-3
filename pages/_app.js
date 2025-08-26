// pages/_app.js
import { useEffect } from "react";

try { require("../styles/globals.css"); } catch {}

export default function MyApp({ Component, pageProps }) {
  useEffect(()=>{ try{ document.body.style.background = "#0b1020"; }catch{} },[]);
  let PriceBar = null;
  try { PriceBar = require("../components/PriceBar").default; } catch {}

  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",background:"#0b1020",color:"#e6edf6"}}>
      {/* Üst çubuk */}
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
                   background:"#0f152a",borderBottom:"1px solid #1f2742"}}>
        <div style={{fontWeight:800,color:"#9bd0ff"}}>Kripto Gözü</div>
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          <button style={btn}>Giriş</button>
          <button style={btn}>Kayıt Ol</button>
        </div>
      </div>

      {/* TL / USD / USDT barı varsa çalışsın */}
      {PriceBar ? <PriceBar/> : null}

      <main style={{flex:1}}>
        <Component {...pageProps} />
      </main>
    </div>
  );
}

const btn = {
  padding:"8px 10px",
  background:"#11182e",
  border:"1px solid #223054",
  borderRadius:10,
  color:"#e6edf6",
  cursor:"pointer"
};
