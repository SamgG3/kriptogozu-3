// pages/login.js
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

/**
 * Giriş Modları:
 * - Hızlı Giriş: sadece isim alır (slot kontrolü yok).
 * - Üyelik Girişi: username + password + role + eşzamanlı oturum (slot) sınırı.
 *
 * Roller ve Sınırlar:
 * - Kurucu (larsalghoulG / Türkaslansem3.)  => max 3
 * - Yönetici (tayfunsevde1907 / TS1907gsS.) => max 2
 * - Arkadaş  (alpAslangökTürk / alpgöksS1.) => max 3
 *
 * Oturum Sınırı (client-side):
 * - localStorage.kgz_slots içinde { kurucu: [ {sid,last} ], yonetici: [...], arkadas:[...] }
 * - Login sırasında eski/güncellenmemiş slotlar GC ile temizlenir.
 * - Başarılı login → slot tahsis edilir, kgz_user kaydedilir, /panel'e yönlendirilir.
 * - Tarayıcı kapanırken/yenilenirken beforeunload ile slot bırakma denenir.
 */

// === Hesaplar + Roller ===
const ACCOUNTS = [
  { username: "larsalghoulG",   password: "Türkaslansem3.", name: "Semih (Kurucu)", role: "kurucu",  max: 3 },
  { username: "tayfunsevde1907",password: "TS1907gsS.",     name: "Yönetici",      role: "yonetici",max: 2 },
  { username: "alpAslangökTürk",password: "alpgöksS1.",     name: "Arkadaş",       role: "arkadas", max: 3 },
];

// Slot tutma süresi (saat) – aktif kalmayan oturumları çöpe atmak için
const SLOT_TTL_MS = 2 * 60 * 60 * 1000; // 2 saat

// ----- Yardımcılar: slot yönetimi -----
function readSlots() {
  if (typeof window === "undefined") return { kurucu: [], yonetici: [], arkadas: [] };
  try {
    const raw = localStorage.getItem("kgz_slots");
    const obj = raw ? JSON.parse(raw) : {};
    return {
      kurucu:  Array.isArray(obj.kurucu)  ? obj.kurucu  : [],
      yonetici: Array.isArray(obj.yonetici) ? obj.yonetici : [],
      arkadas: Array.isArray(obj.arkadas) ? obj.arkadas : [],
    };
  } catch {
    return { kurucu: [], yonetici: [], arkadas: [] };
  }
}
function writeSlots(slots) {
  try { localStorage.setItem("kgz_slots", JSON.stringify(slots)); } catch {}
}
function now() { return Date.now(); }
function gcRole(slots, role) {
  const arr = slots[role] || [];
  const t = now();
  slots[role] = arr.filter(x => x && typeof x.last === "number" && (t - x.last) < SLOT_TTL_MS);
}
function genSID() {
  const r = Math.random().toString(36).slice(2);
  return `${Date.now()}-${r}`;
}
function occupySlot(role, max) {
  const slots = readSlots();
  gcRole(slots, role);
  if ((slots[role] || []).length >= max) {
    writeSlots(slots);
    return { ok: false, used: slots[role].length, max };
  }
  const sid = genSID();
  const entry = { sid, last: now() };
  slots[role] = [entry, ...(slots[role] || [])].slice(0, max); // güvenli
  writeSlots(slots);
  return { ok: true, sid, used: slots[role].length, max };
}
function releaseSlot(role, sid) {
  if (!role || !sid) return;
  const slots = readSlots();
  const arr = slots[role] || [];
  const next = arr.filter(x => x.sid !== sid);
  slots[role] = next;
  writeSlots(slots);
}

// ---- Ana bileşen ----
export default function Login() {
  const router = useRouter();

  // Mod: "quick" | "account"
  const [mode, setMode] = useState("account");

  // Hızlı giriş
  const [name, setName] = useState("");

  // Üyelik girişi
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // UI
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // Aktif SID (slot bırakma için)
  const sidRef = useRef(null);
  const roleRef = useRef(null);

  // Zaten girişliyse /panel
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("kgz_user");
    if (raw) router.replace("/panel");
  }, [router]);

  // Sayfa kapanırken/yenilenirken slot bırak
  useEffect(() => {
    const onUnload = () => {
      try { releaseSlot(roleRef.current, sidRef.current); } catch {}
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
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

  const onAccount = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const u = (username || "").trim();
      const p = (password || "").trim();
      if (!u || !p) { setErr("Kullanıcı adı ve şifre gerekli."); return; }

      // Hesap bul
      const acc = ACCOUNTS.find(a => a.username === u);
      if (!acc || acc.password !== p) {
        setErr("Kullanıcı adı veya şifre hatalı.");
        return;
      }

      // Slot tahsis
      const res = occupySlot(acc.role, acc.max);
      if (!res.ok) {
        setErr(`Bu hesapta eşzamanlı giriş sınırına ulaşıldı (${res.used}/${res.max}). Lütfen mevcut oturumlardan biri çıksın veya birazdan tekrar deneyin.`);
        return;
      }

      // Slot bilgilerimizi saklayalım (panel'de istersen kullanırsın)
      sidRef.current = res.sid;
      roleRef.current = acc.role;

      goPanel({
        name: acc.name || acc.username,
        username: acc.username,
        role: acc.role,     // "kurucu" | "yonetici" | "arkadas"
        sid: res.sid,
        mode: "account",
        ts: Date.now(),
      });
    } finally {
      setLoading(false);
    }
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
        <Tab id="account" label="Üyelik Girişi" />
        <Tab id="quick" label="Hızlı Giriş" />
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
            placeholder="Kullanıcı adı (örn. larsalghoulG)"
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
            disabled={loading}
            style={{
              padding: "10px 12px",
              background: "#1a1f2e",
              border: "1px solid #2a2f45",
              borderRadius: 10,
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? "Kontrol ediliyor…" : "Giriş Yap"}
          </button>

          <div style={{ opacity:.75, fontSize:12, lineHeight:1.5 }}>
            <div><b>Kurucu:</b> larsalghoulG / Türkaslansem3.  (max 3 eşzamanlı)</div>
            <div><b>Yönetici:</b> tayfunsevde1907 / TS1907gsS. (max 2 eşzamanlı)</div>
            <div><b>Arkadaş:</b> alpAslangökTürk / alpgöksS1.  (max 3 eşzamanlı)</div>
          </div>
        </form>
      )}
    </main>
  );
}
