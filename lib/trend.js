// lib/trend.js
// Son iki pivot yüksek/düşükten trend çizip kırılım bakar
export function detectTrendBreakouts(ohlc){
  const n = Math.min(ohlc.length, 200)
  const arr = ohlc.slice(-n)
  function pivots(kind){
    const pts=[]
    for (let i=1;i<arr.length-1;i++){
      if (kind==='high' && arr[i].high>arr[i-1].high && arr[i].high>arr[i+1].high) pts.push({i, v:arr[i].high})
      if (kind==='low'  && arr[i].low <arr[i-1].low  && arr[i].low <arr[i+1].low ) pts.push({i, v:arr[i].low})
    }
    return pts.slice(-2)
  }
  const ph = pivots('high'), pl = pivots('low')
  const lastC = arr.at(-1)?.close ?? 0
  const out=[]
  if (ph.length===2){
    const [a,b]=ph, slope=(b.v-a.v)/(b.i-a.i), line=b.v + slope*((arr.length-1)-b.i)
    out.push({ kind:'falling', broke: lastC>line, refPrice: line })
  }
  if (pl.length===2){
    const [a,b]=pl, slope=(b.v-a.v)/(b.i-a.i), line=b.v + slope*((arr.length-1)-b.i)
    out.push({ kind:'rising', broke: lastC<line, refPrice: line })
  }
  return out
}
