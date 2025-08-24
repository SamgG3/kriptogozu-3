import crypto from "crypto";

function sign(payload, secret){
  const h = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${h}`;
}

export default async function handler(req, res){
  try{
    if(req.method !== "POST") return res.status(405).json({ error:"Method not allowed" });

    const { user, pass } = req.body || {};
    if(!user || !pass) return res.status(400).json({ error:"user & pass required" });

    if(user !== process.env.ADMIN_USER || pass !== process.env.ADMIN_PASS){
      return res.status(401).json({ error:"Geçersiz kimlik bilgisi" });
    }

    // basit imzalı session (24 saat)
    const payload = JSON.stringify({ u:user, t: Date.now() });
    const token = sign(payload, process.env.SESSION_SECRET || "fallback");

    res.setHeader("Set-Cookie", [
      `sess=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60*60*24}`
    ]);

    return res.status(200).json({ ok:true });
  }catch(err){
    return res.status(500).json({ error:String(err) });
  }
}
