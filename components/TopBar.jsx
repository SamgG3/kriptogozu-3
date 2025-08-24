// components/TopBar.jsx
"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Basit auth mantığı:
 * - login'de localStorage.setItem("kg-auth", "1");
 * - login'de localStorage.setItem("kg-user", JSON.stringify({ name, avatar }))
 * - logout'ta bu anahtarları sil.
 *
 * Not: İleride gerçek backend/JWT kurarsak, burası /api/me'den user çekebilir.
 */

export default function TopBar() {
  const [user, setUser] = useState(null);   // {name, avatar}
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const ok = typeof window !== "undefined" && localStorage.getItem("kg-auth") === "1";
      if (ok) {
        const raw = localStorage.getItem("kg-user");
        if (raw) {
          const u = JSON.parse(raw);
          if (u && typeof u === "object") setUser(u);
        } else {
          // isim/avatarsız default profil
          setUser({ name: "Kullanıcı", avatar: "" });
        }
      }
    } catch {}
    setReady(true);
  }, []);

  function logout() {
    try {
      localStorage.removeItem("kg-auth");
      localStorage.removeItem("kg-user");
      // İstersen admin verilerini de temizleyebilirsin:
      // localStorage.removeItem("kg-admin-symbols");
    } catch {}
    // Sayfayı yenile
    if (typeof window !== "undefined") window.location.href = "/";
  }

  // SSR/CSR farkı titremesin diye hazır olana kadar boş döndür
  if (!ready) return null;

  return (
    <header style={{
      position:"sticky", top:0, zIndex:50,
      background:"#0b0f1a", borderBottom:"1px solid #1c2438",
      padding:"10px 16px", display:"flex", alignItems:"center", justifyContent:"space-between"
    }}>
      <div style={{display:"flex", alignItems:"center", gap:10}}>
        <Link href="/" style={{textDecoration:"none", color:"#cfe6ff", fontWeight:900, letterSpacing:.3}}>
          KriptoGözü
        </Link>
        <nav style={{display:"flex", gap:12, marginLeft:8}}>
          <Link href="/" style={{color:"#9fb3d9"}}>Ana Sayfa</Link>
          <Link href="/admin" style={{color:"#9fb3d9"}}>Panel</Link>
        </nav>
      </div>

      {/* Sağ taraf: kullanıcı alanı */}
      {!user ? (
        // Giriş yoksa buton
        <Link
          href="/login"
          style={{
            padding:"8px 12px", background:"#1e2a44", border:"1px solid #2c3960",
            borderRadius:10, color:"#e6f0ff", fontWeight:800, textDecoration:"none"
          }}
        >
          Giriş
        </Link>
      ) : (
        // Giriş varsa profil menüsü
        <div style={{display:"flex", alignItems:"center", gap:10}}>
          <div style={{
            width:32, height:32, borderRadius:"50%", background:"#1e2a44",
            display:"grid", placeItems:"center", overflow:"hidden", border:"1px solid #2c3960"
          }}>
            {user?.avatar
              ? <img src={user.avatar} alt="avatar" style={{width:"100%", height:"100%"}}/>
              : <span style={{fontSize:14, color:"#cfe6ff", fontWeight:800}}>
                  {String(user?.name||"U").slice(0,1).toUpperCase()}
                </span>
            }
          </div>
          <span style={{color:"#cfe6ff", fontWeight:800}}>{user?.name || "Kullanıcı"}</span>

          <button
            onClick={logout}
            style={{
              marginLeft:6, padding:"6px 10px", background:"#2a334e", border:"1px solid #3a4670",
              borderRadius:8, color:"#fff", fontWeight:800, cursor:"pointer"
            }}
          >
            Çıkış
          </button>
        </div>
      )}
    </header>
  );
}
