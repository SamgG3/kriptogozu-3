// pages/login.js
"use client";
import React from "react";
import Link from "next/link";

export default function LoginPage() {
  function login() {
    const user = { name: "Semih", avatar: "" }; // istersen avatar URL koyabilirsin
    // localStorage
    localStorage.setItem("kg-auth", "1");
    localStorage.setItem("kg-user", JSON.stringify(user));
    // cookie (opsiyonel ama önerilir)
    document.cookie = "kg-auth=1; path=/; Max-Age=86400";
    document.cookie = `kg-user=${encodeURIComponent(JSON.stringify(user))}; path=/; Max-Age=86400`;
    // TopBar'a haber ver
    window.dispatchEvent(new Event("kg-auth-changed"));
    // Ana sayfaya dön
    window.location.href = "/";
  }

  function logout() {
    localStorage.removeItem("kg-auth");
    localStorage.removeItem("kg-user");
    document.cookie = "kg-auth=; Max-Age=0; path=/";
    document.cookie = "kg-user=; Max-Age=0; path=/";
    window.dispatchEvent(new Event("kg-auth-changed"));
    window.location.href = "/";
  }

  return (
    <main style={{minHeight:"100vh", background:"#0f1320", color:"#e6f0ff", padding:24}}>
      <h1 style={{marginTop:0}}>Giriş</h1>
      <div style={{display:"flex", gap:12}}>
        <button onClick={login}
          style={{padding:"10px 14px", background:"#1e2a44", border:"1px solid #2c3960", borderRadius:10, color:"#fff", fontWeight:800}}>
          Giriş Yap
        </button>
        <button onClick={logout}
          style={{padding:"10px 14px", background:"#2a334e", border:"1px solid #3a4670", borderRadius:10, color:"#fff", fontWeight:800}}>
          Çıkış Yap
        </button>
        <Link href="/" style={{padding:"10px 14px", border:"1px solid #2c3960", borderRadius:10, color:"#cfe6ff"}}>Ana Sayfa</Link>
      </div>
      <p style={{opacity:.8, marginTop:12}}>“Giriş Yap”a bastıktan sonra üstte **Giriş** yazısı kaybolmalı ve **profil** görünmeli.</p>
    </main>
  );
}
