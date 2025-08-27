// pages/panel.js
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

export default function Panel() {
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("kgz_user");
    if (!raw) {
      router.replace("/login");
      return;
    }
    try { setUser(JSON.parse(raw)); } catch { router.replace("/login"); }
  }, [router]);

  if (!user) return null;

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <Link href="/" style={{ color: "#8bd4ff", fontWeight: 800 }}>Ana Sayfa</Link>
      </div>

      <h1 style={{ marginBottom: 8 }}>Panel</h1>
      <div style={{ opacity: .8, marginBottom: 18 }}>Merhaba <b>{user.name}</b> 👋</div>

      <div style={{ border: "1px solid #23283b", borderRadius: 10, padding: 16, background: "#121625" }}>
        Buraya admin/favoriler/uyarılar gibi panelleri ekleyebiliriz.
      </div>
    </main>
  );
}
