// pages/_app.js
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

try { require("../styles/globals.css"); } catch {}

export default function MyApp({ Component, pageProps }) {
  const router = useRouter();
  const [user, setUser] = useState(null);

  // Arkaplan rengi
  useEffect(() => {
    try { document.body.style.background = "#0b1020"; } catch {}
  }, []);

  // Giriş bilgisi (localStorage)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("kgz_user");
    if (raw) {
      try { setUser(JSON.parse(raw)); } catch {}
    }
  }, []);

  const logout = () => {
    try { localStorage.removeItem("kgz_user"); } catch {}
    setUser(null);
    router.push("/");
  };

  // PriceBar opsiyonel
  let PriceBar = null;
  try { PriceBar = require("../components/PriceBar").default; } catch {}

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#0b1020", color: "#e6edf6" }}>
      {/* Üst çubuk */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#0f152a", borderBottom: "1px solid #1f2742" }}>
        {/* Logo → Ana Sayfa */}
        <Link href="/" style={{ fontWeight: 900, color: "#9bd0ff", textDecoration: "none", fontSize: 18 }}>
          Kripto Gözü
        </Link>

        {/* Global nav */}
        <div style={{ display: "flex", gap: 12 }}>
          <Link href="/" style={navLink}>Ana Sayfa</Link>
          <Link href="/panel" style={navLink}>Panel</Link>
          <Link href="/whales" style={navLink}>Balina</Link>
          <Link href="/balina2d" style={navLink}>Balina2D</Link>
        </div>

        {/* Sağ taraf */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ opacity: .7 }}>TR / EN</span>

          {user ? (
            <>
              <span style={{ background: "#1f2a44", padding: "6px 10px", borderRadius: 8, fontWeight: 700 }}>
                {user.name || "Kullanıcı"}
              </span>
              <button onClick={() => router.push("/panel")} style={btn}>Panel</button>
              <button onClick={logout} style={btn}>Çıkış</button>
            </>
          ) : (
            <>
              {/* Giriş: /login sayfası açılır */}
              <Link href="/login" style={btnLink}>Giriş</Link>
              {/* Kayıt Ol: şimdilik işlevsiz (buton) */}
              <button style={btn} onClick={(e) => e.preventDefault()} title="Yakında">Kayıt Ol</button>
            </>
          )}
        </div>
      </div>

      {/* TL / USD / USDT barı */}
      {PriceBar ? <PriceBar /> : null}

      <main style={{ flex: 1 }}>
        <Component {...pageProps} />
      </main>
    </div>
  );
}

const navLink = {
  color: "#d0d6e6",
  textDecoration: "none",
  fontWeight: 600,
};

const btn = {
  padding: "8px 10px",
  background: "#11182e",
  border: "1px solid #223054",
  borderRadius: 10,
  color: "#e6edf6",
  cursor: "pointer"
};

const btnLink = {
  ...btn,
  textDecoration: "none",
  display: "inline-block"
};
