// pages/whales.js
import dynamic from "next/dynamic";
import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";

const WhaleStream = dynamic(() => import("../components/WhaleStream"), { ssr:false });

export default function WhalesPage(){
  const router = useRouter();

  return (
    <main style={{ minHeight:"100vh", background:"#0f1320", color:"#e6f0ff", padding:"16px 18px", paddingBottom:60 }}>
      {/* Üst kısayollar (geri + nav) */}
      <nav style={{ display:"flex", gap:16, alignItems:"center", marginBottom:12 }}>
        <button
          onClick={()=> router.back()}
          style={{ background:"#1a1f2e", border:"1px solid #2a2f45", color:"#fff", borderRadius:8, padding:"6px 10px", cursor:"pointer" }}
        >
          ← Geri
        </button>
        <Link href="/" style={{ color:"#8bd4ff", fontWeight:900, fontSize:18, textDecoration:"none" }}>
          Kripto Gözü
        </Link>
        <Link href="/" style={{ color:"#d0d6e6", textDecoration:"none" }}>Ana Sayfa</Link>
        <Link href="/panel" style={{ color:"#d0d6e6", textDecoration:"none" }}>Panel</Link>
        <Link href="/whales" style={{ color:"#fff", textDecoration:"none" }}>Balina</Link>
        <Link href="/balina2d" style={{ color:"#d0d6e6", textDecoration:"none" }}>Balina2D</Link>
      </nav>

      <h1 style={{ marginTop:0 }}>Balina Sinyalleri (BTC & ETH)</h1>

      <div
        style={{
          display:"grid",
          gridTemplateColumns:"repeat(auto-fit, minmax(360px, 1fr))",
          gap:12
        }}
      >
        {/* BTC */}
        <section style={{ border:"1px solid #25304a", borderRadius:12, overflow:"hidden", background:"#0f1320" }}>
          <div style={{ padding:"10px 12px", background:"#151b2c", fontWeight:800, color:"#9bd0ff" }}>BTC</div>
          {/* 200.000$ eşik – canlı akış WhaleStream */}
          <WhaleStream symbols={["BTCUSDT"]} minUsd={200000} />
        </section>

        {/* ETH */}
        <section style={{ border:"1px solid #25304a", borderRadius:12, overflow:"hidden", background:"#0f1320" }}>
          <div style={{ padding:"10px 12px", background:"#151b2c", fontWeight:800, color:"#9bd0ff" }}>ETH</div>
          {/* 200.000$ eşik – canlı akış WhaleStream */}
          <WhaleStream symbols={["ETHUSDT"]} minUsd={200000} />
        </section>
      </div>

      <p style={{ opacity:.6, marginTop:12, fontSize:12 }}>
        Kaynak: Binance Futures (forceOrder). Bilgi amaçlıdır, yatırım tavsiyesi değildir.
      </p>
    </main>
  );
}
