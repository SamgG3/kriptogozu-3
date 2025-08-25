// pages/api/auth/login.js
// Not: Bu demo sunucusuz ortamda çalışır; aktif oturum sayacı "sıcak" instance'da tutulur.
// Üretimde: Redis/KV + JWT + refresh + IP rate limit şart.

const USERS = [
  { username: 'larsalghoulG', password: 'Türkaslansem3.', role: 'Kurucu',         maxSessions: 99 },
  { username: 'tayfunsevdebm', password: 'GS1ekim1905.', role: 'Genel Yönetici', maxSessions: 2  },
]

const ACTIVE = new Map() // username => Set(sessionId)

function parseBody(req){
  return new Promise((resolve)=>{
    let data=''; req.on('data',c=>data+=c); req.on('end',()=>{ try{resolve(JSON.parse(data||'{}'))}catch{resolve({})} })
  })
}

function setCookie(res, name, value, opts={}){
  const { httpOnly=true, path='/', maxAge=60*60*24, sameSite='Lax', secure=true } = opts
  const parts = [`${name}=${value}`]
  if (path) parts.push(`Path=${path}`)
  if (httpOnly) parts.push('HttpOnly')
  if (sameSite) parts.push(`SameSite=${sameSite}`)
  if (maxAge) parts.push(`Max-Age=${maxAge}`)
  if (secure) parts.push('Secure')
  res.setHeader('Set-Cookie', parts.join('; '))
}

function b64json(obj){ return Buffer.from(JSON.stringify(obj)).toString('base64url') }

export default async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'Method not allowed' })
  const { username, password } = await parseBody(req)

  const row = USERS.find(u => u.username===username && u.password===password)
  if (!row) return res.status(401).json({ ok:false, error:'Geçersiz kullanıcı adı veya şifre' })

  // aktif oturum sayısı
  const set = ACTIVE.get(row.username) || new Set()
  if (set.size >= row.maxSessions) {
    return res.status(429).json({ ok:false, error:'Bu hesap için eş zamanlı oturum sınırına ulaşıldı' })
  }

  const sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36)
  set.add(sessionId); ACTIVE.set(row.username, set)

  // oturum ve kullanıcı bilgilerini cookie'ye koy
  setCookie(res, 'kg_session', sessionId, { httpOnly:true })
  setCookie(res, 'kg_user', b64json({ username: row.username, role: row.role }), { httpOnly:true })

  return res.status(200).json({ ok:true, user:{ username: row.username, role: row.role } })
}

// Yardımcı (opsiyonel export): logout bu map'ten düşer
export function _activeSessions(){ return ACTIVE }
