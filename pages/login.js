// pages/login.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

/**
 * Not: Bu sayfa tamamen client-side çalışır (localStorage).
 * - Hızlı Giriş: sadece isim alır.
 * - Üyelik Girişi: kullanıcı adı + şifre (örnek hesap aşağıda).
 * Güvenlik amaçlı değildir; demo/kapalı beta için uygundur.
 */

// İstersen burayı düzenleyebilirsin (örnek hesap)
const PRESET_ACCOUNTS = [
  { username: "semih", password: "kgz123", name: "Semih" },
];

export default function Login() {
  const router = useRouter();

  // Mod: "quick" | "account"
  const [mode, setMode] = useState("quick");

  // Hızlı giriş
  const [name, setName] = useState("");

  // Üyelik girişi
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // UI
  const [err, setErr] = useState("");

  // Zaten girişliyse /panel
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("kgz_user");
    if (raw) router.replace("/panel");
  }, [router]);

  // localStorage'da hesap listesi yoksa örnek hesabı yaz
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("kgz_accounts");
      if (!raw) {
        localStorage.setItem("kgz_accounts", JSON.stringify(PRESET_ACCOUNTS));
      }
    } catch {}
  }, []);

  const goPanel = (payload) => {
    try { localStorage.setItem("kgz_user", JSON.stringify(payload)); } catch {}
    router.replace("/panel");
  };

  const onQuick = (e) => {
    e.preventDefault();
    setErr("");
    const n = (name || "").trim();
    if (!n) { setErr("Lütfen bir isim yaz."); return; }
    goPanel({ name: n, mode: "quick", ts: Date.now() });
  };

  const onAccount = (e) => {
    e.preventDefault();
    setErr("");
    const u = (username || "").trim().toLowerCase();
    const p = (password || "").trim();
    if (!u || !p) { setErr("Kullanıcı adı ve şifre gerekli."); return; }

    // local hesaplar
    let list = [];
    try {
      const raw = localStorage.getItem("kgz_accounts");
      list = raw ? JSON.parse(raw) : PRESET_ACCOUNTS;
    } catch {
      list = PRESET_ACCOUNTS;
    }

    const hit = list.find(
      acc => acc.username?.toLowerCase() === u && String(acc.password) === String(p)
    );
    if (!hit) { setErr("Hatalı kullanıcı adı veya şifre."); return; }

    goPanel({ name: hit.name || hit.username, username: hit.username, mode: "account", ts: Date.now() });
  };

  const Tab = ({ id, label }) => (
    <button
      onClick={() => { setMode(id); setErr(""); }}
      style={{
        padding: "8px 12px",
        borderRadius: 10,
        border: "1px solid #2a2f45",
        background: mode === id ? "#1f2a44" : "#121625",
        color: "#fff",
        fontWeight: 700,
        cursor: "pointer",
      }}
      type="button"
    >
      {label}
    </button>
  );

  return (
    <main style={{ padding: 16 }}>
      {/* Üst kısayollar */}
      <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:12 }}>
        <button
          onClick={() => (history.length > 1 ? history.back() : router.push("/"))}
          style={{ padding:"6px 10px", background:"#1a1f2e", border:"1px solid #2a2f45", borderRadius:8, color:"#fff", cursor:"pointer" }}
          type="button"
        >
          ← Geri
        </button>
        <Link href="/" style={{ color:"#8bd4ff", fontWeight:800, textDecoration:"none" }}>
          Kripto Gözü
        </Link>
      </div>

      <h1 style={{ marginBottom: 12 }}>Giriş</h1>

      {/* Sekmeler */}
      <div style={{ display:"flex", gap:8, marginBottom:12 }}>
        <Tab id="quick" label="Hızlı Giriş" />
        <Tab id="account" label="Üyelik Girişi" />
      </div>

      {/* Hata */}
      {err && (
        <div style={{
          marginBottom: 12,
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid #7a2e2e",
          background: "#2a1d1d",
          color: "#ffaaaa",
          fontWeight: 700
        }}>
          {err}
        </div>
      )}

      {/* İçerik */}
      {mode === "quick" ? (
        <form onSubmit={onQuick} style={{ display: "grid", gap: 12, maxWidth: 420 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Adın (ör. Semih)"
            style={{
              padding: "10px 12px",
              background: "#121625",
              border: "1px solid #23283b",
              borderRadius: 10,
              color: "#fff",
            }}
          />
          <button
            type="submit"
            style={{
              padding: "10px 12px",
              background: "#1a1f2e",
              border: "1px solid #2a2f45",
              borderRadius: 10,
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Gir
          </button>
        </form>
      ) : (
        <form onSubmit={onAccount} style={{ display: "grid", gap: 12, maxWidth: 420 }}>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Kullanıcı adı (ör. semih)"
            autoComplete="username"
            style={{
              padding: "10px 12px",
              background: "#121625",
              border: "1px solid #23283b",
              borderRadius: 10,
              color: "#fff",
            }}
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Şifre"
            type="password"
            autoComplete="current-password"
            style={{
              padding: "10px 12px",
              background: "#121625",
              border: "1px solid #23283b",
              borderRadius: 10,
              color: "#fff",
            }}
          />
          <button
            type="submit"
            style={{
              padding: "10px 12px",
              background: "#1a1f2e",
              border: "1px solid #2a2f45",
              borderRadius: 10,
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Giriş Yap
          </button>

          <div style={{ opacity:.7, fontSize:12 }}>
            Örnek hesap: <b>semih</b> / <b>kgz123</b> &nbsp; (İstersen `localStorage.kgz_accounts` içine kendi hesabını ekleyebilirsin.)
          </div>
        </form>
      )}
    </main>
  );
}
