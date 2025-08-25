// pages/api/auth/me.js
function getCookie(req, name){
  const raw = req.headers.cookie || ''
  const m = raw.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))
  return m ? decodeURIComponent(m.split('=')[1]) : null
}

export default async function handler(req, res){
  const b64 = getCookie(req, 'kg_user')
  if (!b64) return res.status(200).json({ ok:true, user:null })
  try {
    const user = JSON.parse(Buffer.from(b64, 'base64url').toString())
    return res.status(200).json({ ok:true, user })
  } catch {
    return res.status(200).json({ ok:true, user:null })
  }
}
