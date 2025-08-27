// pages/login.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

/**
 * Basit client-side login (localStorage, demo)
 * - Hızlı Giriş: test için 'arkadas' rolü
 * - Üyelik: preset hesaplardan (Kurucu/Yönetici/Arkadaş)
 * - Slot limiti (yerel): kurucu ≤3, yonetici ≤2 (Arkadaş limitsiz)
 * - Oturumlar 8 saatte otomatik temizlenir (TTL).
 * Not: Gerçek çok-kullanıcılı kısıtlama için server gerekir.
 */

// Verdiğin gerçek hesaplar
const MUST_HAVE_ACCOUNTS = [
  { username: "larsalghoulG",   password: "Türkaslansem3.", name: "Semih",     role: "kurucu"   },
  { username: "tayfunsevde1907",password: "TS1907gsS.",     name: "Yönetici",  role: "yonetici" },
  { username: "alpAslangökTürk",password: "alpgöksS1.",     name: "Arkadaş",   role: "arkadas"  },
];

// Rol başına slot (yerel)
const ROLE_LIMITS = { kurucu: 3, yonetici: 2 }; // arkadas: sınırsız
const SESSION_TTL_HOURS = 8;
const SESS_KEY = "kgz_sessions";
const ACC_KEY  = "kgz_accounts";
const USER_KEY = "kgz_user";

function now(){ return Date.now(); }
function ttlMs(){ return SESSION_TTL_HOURS*60*60*1000; }

function readJSON(key, def){
  try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : def; }catch{ return def; }
}
function writeJSON(key, val){
  try{ localStorage.setItem(key, JSON.stringify(val)); }catch{}
}

function purgeOldSessions(list){
  const cutoff = now()-ttlMs();
  return (Array.isArray(list)?list:[]).filter(s => (s && s.ts && s.ts>=cutoff));
}
function countRole(list, role){
  return list.filter(s => s.role===role).length;
}
function addSession(role){
  const list = purgeOldSessions(readJSON(SESS_KEY, []));
  const id = `${role}-${now()}-${Math.random().toString(36).slice(2,8)}`;
  list.push({ id, role, ts: now() });
  writeJSON(SESS_KEY, list);
  try{ localStorage.setItem("kgz_session_id", id); }catch{}
}
function ensureAccounts(){
  // Var olanları çek, MUST_HAVE ile birleştir (aynı username varsa güncelle)
  let cur = readJSON(ACC_KEY, []);
  if (!Array.isArray(cur)) cur = [];
  const map = new Map(cur.map(a => [String(a.username||"").toLowerCase(), a]));
  for (const a of MUST_HAVE_ACCOUNTS){
    map.set(String(a.username).toLowerCase(), a);
  }
  const merged = Array.from(map.values());
  writeJSON(ACC_KEY, merged);
  return merged;
}

export default function Login(){
  const router = useRouter();

  const [mode, setMode] = useState("account"); // "quick" | "account"
  const [name, setName] = useState("");        // quick
  const [username, setUsername] = useState(""); // account
  const [password, setPassword] = useState(""); // account
  const [err, setErr] = useState("");

  // İlk yüklemede: hesapları garanti altına al ve eski oturumları temizle
  useEffect(()=>{
    if (typeof window === "undefined") return;
    ensureAccounts();
    const cleaned = purgeOldSessions(readJSON(SESS_KEY, []));
    writeJSON(SESS_KEY, cleaned);
  },[]);

  // Zaten girişliyse /panel
  useEffect(()=>{
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(USER_KEY);
    if (raw) router.replace("/panel");
  },[router]);

  const go = (userObj) => {
    writeJSON(USER_KEY, userObj);
    router.replace("/panel");
  };

  function checkSlotsAndAdd(role){
    // Arkadaş sınırsız
    if (!ROLE_LIMITS[role]) { addSession(role); return { ok:true }; }
    const list = purgeOldSessions(readJSON(SESS_KEY, []));
    const used = countRole(list, role);
    const max  = ROLE_LIMITS[role];
    if (used >= max){
      return { ok:false, msg:`${role.toUpperCase()} slotları dolu (${used}/${max}). Lütfen bir oturum kapansın veya bekleyin.` };
    }
    addSession(role);
    return { ok:true };
  }

  const onQuick = (e)=>{
    e.preventDefault();
    setErr("");
    const n = (name||"").trim();
    if (!n){ setErr("Lütfen ad yaz."); return; }
    const role = "arkadas";
    const ch = checkSlotsAndAdd(role);
    if (!ch.ok){ setErr(ch.msg); return; }
    go({ name:n, username:n.toLowerCase(), role, mode:"quick", ts: now() });
  };

  const onAccount = (e)=>{
    e.preventDefault();
    setErr("");
    const u = (username||"").trim().toLowerCase();
    const p = (password||"").trim();
    if (!u || !p){ setErr("Kullanıcı adı ve şifre gerekli."); return; }
    const list = ensureAccounts();
    const hit = list.find(acc => String(acc.username||"").toLowerCase()===u && String(acc.password)===String(p));
    if (!hit){ setErr("Hatalı kullanıcı adı veya şifre."); return; }

    const role = hit.role || "arkadas";
    const ch = checkSlotsAndAdd(role);
    if (!ch.ok){ setErr(ch.msg); return; }

    go({ name: hit.name || hit.username, username: hit.username, role, mode:"account", ts: now() });
  };

  const Tab = ({ id, label }) => (
    <button
      onClick={()=>{ setMode(id); setErr(""); }}
      type="button"
      style={{
        padding:"8px 12px", borderRadius:10, border:"1px solid #2a2f45",
        background: mode===id ? "#1f2a44" : "#121625",
        color:"#fff", fontWeight:700, cursor:"pointer"
      }}
    >
      {label}
    </button>
  );

  // (İsteğe bağlı) Slot kullanımını göster
  const [slotInfo, setSlotInfo] = useState(null);
  useEffect(()=>{
    if (typeof window === "undefined") return;
    const list = purgeOldSessions(readJSON(SESS_KEY, []));
    setSlotInfo({
      kurucu:  countRole(list,"kurucu"),
      yonetici:countRole(list,"yonetici"),
      arkadas: countRole(list,"arkadas"),
    });
  },[mode, err]);

  return (
    <main style={{ padding:16 }}>
      {/* Üst kısa yol */}
      <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:12 }}>
        <button
          onClick={()=> (history.length>1 ? history.back() : router.push("/"))}
          type="button"
          style={{ padding:"6px 10px", background:"#1a1f2e", border:"1px solid #2a2f45", borderRadius:8, color:"#fff", cursor:"pointer" }}
        >
          ← Geri
        </button>
        <Link href="/" style={{ color:"#8bd4ff", fontWeight:800, textDecoration:"none" }}>Kripto Gözü</Link>
      </div>

      <h1 style={{ marginBottom:12 }}>Giriş</h1>

      {/* Sekmeler */}
      <div style={{ display:"flex", gap:8, marginBottom:12 }}>
        <Tab id="account" label="Üyelik Girişi" />
        <Tab id="quick"   label="Hızlı Giriş (arkadaş)" />
      </div>

      {/* Hata */}
      {err && (
        <div style={{
          marginBottom:12, padding:"8px 10px", borderRadius:8,
          border:"1px solid #7a2e2e", background:"#2a1d1d", color:"#ffaaaa", fontWeight:700
        }}>
          {err}
        </div>
      )}

      {/* Slot göstergesi (opsiyonel) */}
      {slotInfo && (
        <div style={{ display:"flex", gap:10, marginBottom:12, opacity:.75, fontSize:12 }}>
          <div>Kurucu: {slotInfo.kurucu}/{ROLE_LIMITS.kurucu || "∞"}</div>
          <div>Yönetici: {slotInfo.yonetici}/{ROLE_LIMITS.yonetici || "∞"}</div>
          <div>Arkadaş: {slotInfo.arkadas}/∞</div>
        </div>
      )}

      {/* İçerik */}
      {mode==="quick" ? (
        <form onSubmit={onQuick} style={{ display:"grid", gap:12, maxWidth:420 }}>
          <input
            value={name}
            onChange={(e)=>setName(e.target.value)}
            placeholder="Adın (ör. Semih)"
            style={{ padding:"10px 12px", background:"#121625", border:"1px solid #23283b", borderRadius:10, color:"#fff" }}
          />
          <button type="submit"
            style={{ padding:"10px 12px", background:"#1a1f2e", border:"1px solid #2a2f45", borderRadius:10, color:"#fff", fontWeight:700, cursor:"pointer" }}>
            Gir
          </button>
          <div style={{ opacity:.65, fontSize:12 }}>
            Hızlı giriş test içindir ve <b>arkadas</b> rolü verir.
          </div>
        </form>
      ) : (
        <form onSubmit={onAccount} style={{ display:"grid", gap:12, maxWidth:420 }}>
          <input
            value={username}
            onChange={(e)=>setUsername(e.target.value)}
            placeholder="Kullanıcı adı (örn. larsalghoulG)"
            autoComplete="username"
            style={{ padding:"10px 12px", background:"#121625", border:"1px solid #23283b", borderRadius:10, color:"#fff" }}
          />
          <input
            value={password}
            onChange={(e)=>setPassword(e.target.value)}
            placeholder="Şifre"
            type="password"
            autoComplete="current-password"
            style={{ padding:"10px 12px", background:"#121625", border:"1px solid #23283b", borderRadius:10, color:"#fff" }}
          />
          <button type="submit"
            style={{ padding:"10px 12px", background:"#1a1f2e", border:"1px solid #2a2f45", borderRadius:10, color:"#fff", fontWeight:700, cursor:"pointer" }}>
            Giriş Yap
          </button>

          <div style={{ opacity:.75, fontSize:12, lineHeight:1.4 }}>
            Hazır hesaplar:
            <div><b>Kurucu</b> → <b>larsalghoulG</b> / <b>Türkaslansem3.</b> (limit 3)</div>
            <div><b>Yönetici</b> → <b>tayfunsevde1907</b> / <b>TS1907gsS.</b> (limit 2)</div>
            <div><b>Arkadaş</b> → <b>alpAslangökTürk</b> / <b>alpgöksS1.</b></div>
          </div>
        </form>
      )}
    </main>
  );
}
