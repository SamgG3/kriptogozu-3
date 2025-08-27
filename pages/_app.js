// pages/_app.js
import { useEffect, useState } from "react";
import Link from "next/link";

try { require("../styles/globals.css"); } catch {}

export default function MyApp({ Component, pageProps }) {
  const [user, setUser] = useState(null);

  useEffect(()=>{ try{ document.body.style.background = "#0b1020"; }catch{} },[]);
  useEffect(()=>{
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem("kgz_user");
      if (raw) { try { setUser(JSON.parse(raw)); } catch {} }
    }
  },[]);
  const logout = ()=>{ try{ localStorage.removeItem("kgz_user"); }catch{}; setUser(null); };

  let PriceBar = null;
  try { PriceBar = require("../components/PriceBar").default; } catch {}

  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",background:"#0b1020",color:"#e6edf6"}}>
      {/* Üst çubuk */}
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",
                   background:"#0f152a",borderBottom:"1px solid #1f2742", flexWrap:"wrap"}}>
        {/* Logo → Ana sayfa */}
        <Link href="/" style={{fontWeight:900,color:"#9bd0ff", textDecoration:"none"}}>Kripto Gözü</Link>

        {/* Nav (Panel-Sinyal her zaman görünür; sayfa içi guard zaten var) */}
        <div style={{display:"flex", gap:10, alignItems:"center"}}>
          <Link href="/"           style={nav}>Ana Sayfa</Link>
          <Link href="/panel"     style={nav}>Panel</Link>
          <Link href="/whales"    style={nav}>Balina</Link>
          <Link href="/balina2d"  style={nav}>Balina2D</Link>
          <Link href="/panel-sinyal" style={navStrong}>Panel-Sinyal</Link>
        </div>

        {/* Sağ taraf */}
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          <span style={{opacity:.7, alignSelf:"center"}}>TR / EN</span>
          {user ? (
            <>
              <span style={{ background:"#1f2a44", padding:"6px 10px", borderRadius:8, fontWeight:700 }}>
                {user.name || user.username || "Kullanıcı"} {user.role ? `• ${user.role}` : ""}
              </span>
              <button onClick={logout} style={btn}>Çıkış</button>
            </>
          ) : (
            <>
              <Link href="/login" style={btnLink}>Giriş</Link>
              <button style={btn} disabled>Kayıt Ol</button>
            </>
          )}
        </div>
      </div>

      {/* Kur barı (TL/USD/USDT) bozulmadan */}
      {PriceBar ? <PriceBar/> : null}

      <main style={{flex:1}}>
        <Component {...pageProps} />
      </main>
    </div>
  );
}

const nav = { color:"#d0d6e6", textDecoration:"none", padding:"4px 8px", borderRadius:8 };
const navStrong = { ...nav, background:"#16213a", border:"1px solid #223054" };
const btn = { padding:"8px 10px", background:"#11182e", border:"1px solid #223054", borderRadius:10, color:"#e6edf6", cursor:"pointer" };
const btnLink = { ...btn, textDecoration:"none", display:"inline-flex", alignItems:"center" };
