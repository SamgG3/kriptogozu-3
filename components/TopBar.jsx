// components/TopBar.jsx
"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";

function getCookie(name) {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function truthy(v) {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "ok";
}
function readAuth() {
  if (typeof window === "undefined") return { isAuthed: false, user: null };
  let authLS = null, userLS = null;
  try { authLS = localStorage.getItem("kg-auth"); userLS = localStorage.getItem("kg-user"); } catch {}
  const authCK = getCookie("kg-auth");
  const userCK = getCookie("kg-user");
  const isAuthed = truthy(authLS) || truthy(authCK);
  let user = null; const raw = userLS || userCK;
  if (raw) { try { user = typeof raw === "string" ? JSON.parse(raw) : raw; } catch {} }
  if (!user || typeof user !== "object") user = { name: "Kullanıcı", avatar: "" };
  return { isAuthed, user };
}

export default function TopBar() {
  const [{ isAuthed, user }, setState] = useState(() => readAuth());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(readAuth()); setReady(true);
    const onStorage = (e) => { if (["kg-auth","kg-user"].includes(e.key)) setState(readAuth()); };
    const onVisible = () => setState(readAuth());
    const onAuthChanged = () => setState(readAuth());
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("kg-auth-changed", onAuthChanged);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("kg-auth-changed", onAuthChanged);
    };
  }, []);

  function logout() {
    try {
      localStorage.removeItem("kg-auth");
      localStorage.removeItem("kg-user");
      document.cookie = `kg-auth=; Max-Age=0; path=/`;
      document.cookie = `kg-user=; Max-Age=0; path=/`;
    } catch {}
    if (typeof window !== "undefined") window.location.href = "/";
  }

  if (!ready) return null;

  return (
    <header style={{
      position:"sticky", top:0, zIndex:60,
      background:"#0b0f1a", borderBottom:"1px solid #1c2438",
      padding:"10px 16px", display:"flex", alignItems:"center", justifyContent:"space-between"
    }}>
      <div style={{display:"flex", alignItems:"center", gap:10}}>
        <Link href="/" style={{textDecoration:"none", color:"#cfe6ff", fontWeight:900, letterSpacing:.3}}>
          KriptoGözü
        </Link>
        <nav style={{display:"flex", gap:12, marginLeft:8}}>
          <Link href="/" style={{color:"#9fb3d9"}}>Ana Sayfa</Link>
          <Link href="/whales" style={{color:"#9fb3d9"}}>Balina</Link>
          <Link href="/balina2d" style={{color:"#9fb3d9"}}>Balina2D</Link>
          <Link href="/admin" style={{color:"#9fb3d9"}}>Panel</Link>
        </nav>
      </div>

      <div style={{display:"flex", alignItems:"center", gap:8}}>
        {/* TR/EN toggler (placeholder) */}
        <button title="Dil (TR/EN)" style={{padding:"6px 10px", background:"#16213a", border:"1px solid #24325a", borderRadius:8, color:"#cfe6ff", fontWeight:800, cursor:"default"}}>
          TR / EN
        </button>

        {!isAuthed ? (
          <>
            <Link
              href="/login"
              style={{ padding:"8px 12px", background:"#1e2a44", border:"1px solid #2c3960",
                       borderRadius:10, color:"#e6f0ff", fontWeight:800, textDecoration:"none" }}>
              Giriş
            </Link>
            {/* Kayıt Ol placeholder */}
            <button
              title="Yakında"
              style={{ padding:"8px 12px", background:"#233055", border:"1px solid #2e3c66",
                       borderRadius:10, color:"#d1defc", fontWeight:800, cursor:"default" }}>
              Kayıt Ol
            </button>
          </>
        ) : (
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
      </div>
    </header>
  );
}
