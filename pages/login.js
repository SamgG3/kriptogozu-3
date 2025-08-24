// pages/login.js
"use client";
import React, { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  function onSubmit(e) {
    e.preventDefault();
    if (!id || !pw) { setErr("ID ve şifre zorunlu"); return; }

    const user = { name: id, avatar: "" };
    localStorage.setItem("kg-auth", "1");
    localStorage.setItem("kg-user", JSON.stringify(user));
    document.cookie = "kg-auth=1; path=/; Max-Age=86400";
    document.cookie = `kg-user=${encodeURIComponent(JSON.stringify(user))}; path=/; Max-Age=86400`;

    window.dispatchEvent(new Event("kg-auth-changed"));
    window.location.href = "/";
  }

  return (
    <main style={{minHeight:"100vh", background:"#0f1320", color:"#e6f0ff", padding:24}}>
      <h1 style={{marginTop:0}}>Giriş</h1>
      <form onSubmit={onSubmit} style={{display:"grid", gap:12, maxWidth:360}}>
        <input
          value={id} onChange={e=>setId(e.target.value)}
          placeholder="Kullanıcı ID"
          style={{padding:"10px 12px", background:"#121826", border:"1px solid #2b3247", borderRadius:10, color:"#e8ecf1"}}
        />
        <input
          type="password"
          value={pw} onChange={e=>setPw(e.target.value)}
          placeholder="Şifre"
          style={{padding:"10px 12px", background:"#121826", border:"1px solid #2b3247", borderRadius:10, color:"#e8ecf1"}}
        />
        {err && <div style={{color:"#ff8a8a", fontWeight:700}}>{err}</div>}
        <button type="submit"
          style={{padding:"10px 14px", background:"#1e2a44", border:"1px solid #2c3960", borderRadius:10, color:"#fff", fontWeight:800}}>
          Giriş Yap
        </button>
        <Link href="/" style={{padding:"10px 14px", border:"1px solid #2c3960", borderRadius:10, color:"#cfe6ff", textAlign:"center"}}>Ana Sayfa</Link>
      </form>
    </main>
  );
}
