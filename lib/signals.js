// lib/signals.js
// Basit kural: EMA + RSI ~ (frontend için hafif hesap)
function ema(values, p){
  const k = 2/(p+1); const out=[values[0]]
  for (let i=1;i<values.length;i++) out.push(values[i]*k + out[i-1]*(1-k))
  return out
}
function rsi(values, period=14){
  const gains=[], losses=[]
  for(let i=1;i<values.length;i++){
    const d = values[i]-values[i-1]
    gains.push(Math.max(0,d)); losses.push(Math.max(0,-d))
  }
  const avg=(arr,p)=>{ const o=[]; let s=0; for(let i=0;i<arr.length;i++){ s+=arr[i]; if(i>=p) s-=arr[i-p]; if(i>=p-1) o.push(s/p) } return o }
  const ag=avg(gains,period), al=avg(losses,period)
  const rs=ag.map((g,i)=> (al[i]===0?100:g/(al[i]||1e-12)))
  const rv=rs.map(r=>100-100/(1+r))
  return Array(period).fill(50).concat(rv)
}

export function generateSignalFromOHLC(ohlc){
  if (!ohlc?.length) return null
  const closes = ohlc.map(x=>x.close)
  const e20 = ema(closes,20).at(-1), e50 = ema(closes,50).at(-1)
  const r14 = rsi(closes,14).at(-1)
  const price = closes.at(-1)

  let score=0, side=null, reason=[]
  if (price>e20){score+=10; reason.push('price>EMA20')}
  if (price>e50){score+=10; reason.push('price>EMA50')}
  if (r14>=55){score+=5; reason.push('RSI>=55')}
  if (price<e20){score-=10; reason.push('price<EMA20')}
  if (price<e50){score-=10; reason.push('price<EMA50')}
  if (r14<=45){score-=5; reason.push('RSI<=45')}

  if (score>=10) side='LONG'
  if (score<=-10) side='SHORT'
  if (!side) return null

  const confidence = Math.min(95, Math.max(5, 50+score))
  return { side, confidence, reason: reason.join(','), time: Date.now() }
}
