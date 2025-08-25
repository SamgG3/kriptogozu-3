// lib/sr.js
// Pivot tabanlı S/R + TP/SL hesapları
export function findSR(ohlc, lookback = 120) {
  const n = Math.min(ohlc.length, lookback)
  const arr = ohlc.slice(-n)
  const levels = []
  const isPH = i => arr[i].high > arr[i-1].high && arr[i].high > arr[i+1].high
  const isPL = i => arr[i].low  < arr[i-1].low  && arr[i].low  < arr[i+1].low

  for (let i=1;i<arr.length-1;i++){
    if (isPH(i)) levels.push({ price: arr[i].high, kind: 'resistance', strength: 1 })
    if (isPL(i)) levels.push({ price: arr[i].low,  kind: 'support',    strength: 1 })
  }

  // Yakın seviyeleri birleştir (±0.15%)
  const merged = []
  const tol = 0.0015
  levels.sort((a,b)=>a.price-b.price)
  for (const lv of levels){
    const near = merged.find(m => Math.abs(m.price - lv.price)/lv.price < tol && m.kind===lv.kind)
    if (near){ near.price = (near.price*near.strength + lv.price)/(near.strength+1); near.strength++ }
    else merged.push({...lv})
  }
  const maxS = Math.max(1, ...merged.map(m=>m.strength))
  merged.forEach(m => m.strength = Math.max(1, Math.round(5*m.strength/maxS)))
  return merged
}

export function tpsFromSR(side, price, levels){
  const res = levels.filter(l=>l.kind==='resistance' && l.price>price).map(l=>l.price).sort((a,b)=>a-b)
  const sup = levels.filter(l=>l.kind==='support'    && l.price<price).map(l=>l.price).sort((a,b)=>b-a)
  if (side==='long')  return { tp1: res[0], tp2: res[1], tp3: res[2] }
  else                return { tp1: sup[0], tp2: sup[1], tp3: sup[2] }
}

export function slFromSR(side, price, levels){
  const supports = levels.filter(l=>l.kind==='support').map(l=>l.price).sort((a,b)=>b-a)
  const resist   = levels.filter(l=>l.kind==='resistance').map(l=>l.price).sort((a,b)=>a-b)
  if (side==='long')  return supports[0] ?? price*0.985   // en yakın güçlü destek altı (fallback -1.5%)
  else                return resist[0]   ?? price*1.015   // en yakın güçlü direnç üstü (fallback +1.5%)
}
