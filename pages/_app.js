// pages/_app.js
export default function App({ Component, pageProps }) {
  return (
    <div style={{minHeight:"100vh", background:"#0f1115", color:"#e6e6e6", fontFamily:"system-ui"}}>
      <nav style={{display:"flex", gap:16, alignItems:"center", padding:"12px 18px", borderBottom:"1px solid #23283b"}}>
        <a href="/" style={{color:"#8bd4ff", fontWeight:800, textDecoration:"none"}}>Ana Sayfa</a>
        <a href="/admin" style={{color:"#8bd4ff", opacity:.9, textDecoration:"none"}}>Panel</a>
        <a href="/login" style={{marginLeft:"auto", padding:"6px 10px", background:"#1a1f2e",
          border:"1px solid #2a2f45", borderRadius:8, color:"#fff", textDecoration:"none", fontWeight:700}}>
          Giriş
        </a>
      </nav>
      <Component {...pageProps} />
    </div>
  );
}


