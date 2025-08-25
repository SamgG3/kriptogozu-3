// pages/api/auth/logout.js
import { _activeSessions } from './login'

function getCookie(req, name){
  const raw = req.headers.cookie || ''
  const m = raw.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))
  return m ? decodeURIComponent(m.split('=')[1]) : null
}
function killCookie(res, name){
  res.setHeader('Set-Cookie', `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`)
}

export default async function handler(req, res){
  const sessionId = getCookie(req, 'kg_session')
  const userB64 = getCookie(req, 'kg_user')

  if (userB64){
    try {
      const user = JSON.parse(Buffer.from(userB64, 'base64url').toString())
      const ACTIVE = _activeSessions()
      const set = ACTIVE.get(user.username)
      if (set && sessionId){ set.delete(sessionId); if (!set.size) ACTIVE.delete(user.username) }
    } catch {}
  }
  killCookie(res, 'kg_session')
  killCookie(res, 'kg_user')
  return res.status(200).json({ ok:true })
}
