// components/TrendBadge.jsx
import React from 'react'
import { detectTrendBreakouts } from '../lib/trend'

const fmt = (v,d=2)=>v.toFixed(d)

export default function TrendBadge({ ohlc=[], priceDecimals=2 }) {
  const items = detectTrendBreakouts(ohlc)
  return (
    <div className="mt-3">
      <div className="text-[11px] text-neutral-400 mb-1">Trend kırılımı</div>
      <div className="flex flex-wrap gap-2">
        {items.map((t,i)=>(
          <span key={i}
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border
              ${t.broke ? 'bg-emerald-900/40 border-emerald-700' : 'bg-neutral-800/80 border-neutral-700'}`}>
            {t.kind==='falling' ? 'Düşen' : 'Yükselen'} ref: {fmt(t.refPrice, priceDecimals)} • {t.broke?'Kırıldı':'Kırılmadı'}
          </span>
        ))}
      </div>
    </div>
  )
}
