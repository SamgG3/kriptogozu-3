// pages/login.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";

export default function Login() {
  const router = useRouter();
  const [name, setName] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("kgz_user");
    if (raw) router.replace("/panel");
  }, [router]);

  const onSubmit = (e) => {
    e.preventDefault();
    const n = name.trim() || "Kullanıcı";
    try { localStorage.setItem("kgz_user", JSON.stringify({ name: n })); } catch {}
    router.replace("/panel");
  };

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 12 }}>Giriş</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, maxWidth: 360 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Adın (ör. Semih)"
          style={{ padding: "10px 12px", background: "#121625", border: "1px solid #23283b", borderRadius: 10, color: "#fff" }}
        />
        <button
          type="submit"
          style={{ padding: "10px 12px", background: "#1a1f2e", border: "1px solid #2a2f45", borderRadius: 10, color: "#fff", fontWeight: 700 }}
        >
          Gir
        </button>
      </form>
    </main>
  );
}
