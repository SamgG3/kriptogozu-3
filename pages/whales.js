// pages/whales.js
import Link from "next/link";
import { useRouter } from "next/router";

export default function WhalesPage() {
  const router = useRouter();
  return (
    <main style={{ padding: 16 }}>
      <nav style={{ display:"flex", gap:16, alignItems:"center", marginBottom:12 }}>
        <button onClick={()=> router.back()} style={{ background:"#1a1f2e", border:"1px solid #2a2f45", color:"#fff", borderRadius:8, padding:"6px 10px" }}>← Geri</button>
        <Link href="/" style={{ color:"#8bd4ff", fontWeight:900, fontSize:18 }}>Kripto Gözü</Link>
        <Link href="/" style={{ color:"#d0d6e6" }}>Ana Sayfa</Link>
        <Link href="/panel" style={{ color:"#d0d6e6" }}>Panel</Link>
        <Link href="/whales" style={{ color:"#fff" }}>Balina</Link>
        <Link href="/balina2d" style={{ color:"#d0d6e6" }}>Balina2D</Link>
      </nav>

      <div style={{ border:"1px solid #23283b", borderRadius:10, padding:16, background:"#121625" }}>
        <div style={{ color:"#9bd0ff", fontWeight:800, marginBottom:8 }}>Balina Akışı</div>
        <div style={{ opacity:.75 }}>BTC/ETH/Diğer için canlı akışı burada göstereceğiz (bileşenini eklersen çalışır).</div>
      </div>
    </main>
  );
}
