// pages/panel.js
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

export default function Panel() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [favs, setFavs] = useState([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("kgz_user");
    if (!raw) { router.replace("/login"); return; }
    try { setUser(JSON.parse(raw)); } catch { router.replace("/login"); }
    try { const arr = JSON.parse(localStorage.getItem("kgz_favs")||"[]"); if(Array.isArray(arr)) setFavs(arr); } catch {}
  }, [router]);

  if (!user) return null;

  return (
    <main style={{ padding: 24 }}>
      <nav style={{ display:"flex", gap:12, alignItems:"center", marginBottom:16 }}>
        <button onClick={()=> router.back()} style={{ background:"#1a1f2e", border:"1px solid #2a2f45", color:"#fff", borderRadius:8, padding:"6px 10px" }}>← Geri</button>
        <Link href="/" style={{ color:"#8bd4ff", fontWeight:800 }}>Ana Sayfa</Link>
      </nav>

      <h1 style={{ marginBottom: 8 }}>Panel</h1>
      <div style={{ opacity: .8, marginBottom: 18 }}>Merhaba <b>{user.name}</b> 👋</div>

      <div style={{ border:"1px solid #23283b", borderRadius:10, padding:16, background:"#121625", marginBottom:16 }}>
        <div style={{ fontWeight:800, marginBottom:8, color:"#9bd0ff" }}>Favoriler</div>
        {!favs.length && <div style={{ opacity:.7 }}>Henüz favori yok. Ana sayfadaki ☆ ikonu ile ekleyebilirsin.</div>}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(160px,1fr))", gap:8 }}>
          {favs.map(sym=> (
            <Link key={sym} href={`/coin/${sym}`} style={{ padding:"8px 10px", border:"1px solid #23283b", borderRadius:8, background:"#151a2b", color:"#8bd4ff", fontWeight:700 }}>
              {sym}
            </Link>
          ))}
        </div>
      </div>

      <div style={{ border:"1px solid #23283b", borderRadius:10, padding:16, background:"#121625" }}>
        Buraya admin/favori uyarıları vb. ekleriz.
      </div>
    </main>
  );
}
