import { useState } from "react";

export default function Login() {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e){
    e.preventDefault();
    setLoading(true); setErr(null);
    try{
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ user, pass })
      });
      if(!res.ok){
        const j = await res.json().catch(()=>({error:"Login failed"}));
        throw new Error(j.error || "Login failed");
      }
      window.location.href = "/admin";
    }catch(e){ setErr(e.message); }
    finally{ setLoading(false); }
  }

  return (
    <main style={{minHeight:"100vh",background:"#0f1115",color:"#e6e6e6",display:"grid",placeItems:"center",fontFamily:"system-ui"}}>
      <form onSubmit={onSubmit} style={{width:340,background:"#151a2b",border:"1px solid #26304a",borderRadius:14,padding:18}}>
        <h2 style={{marginTop:0, color:"#59c1ff"}}>KriptoGözü • Giriş</h2>
        <label>Kullanıcı adı</label>
        <input value={user} onChange={e=>setUser(e.target.value)} required
          style={{width:"100%",padding:"10px 12px",marginTop:6,marginBottom:12, background:"#121625",border:"1px solid #23283b",borderRadius:10,color:"#e6e6e6"}}/>
        <label>Şifre</label>
        <input type="password" value={pass} onChange={e=>setPass(e.target.value)} required
          style={{width:"100%",padding:"10px 12px",marginTop:6,marginBottom:12, background:"#121625",border:"1px solid #23283b",borderRadius:10,color:"#e6e6e6"}}/>
        {err && <div style={{color:"#ffb4b4",marginBottom:8}}>Hata: {err}</div>}
        <button disabled={loading} style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1px solid #2a2f45",background:"#1a1f2e",color:"#fff",fontWeight:700,cursor:"pointer"}}>
          {loading ? "Giriş yapılıyor..." : "Giriş yap"}
        </button>
      </form>
    </main>
  );
}
