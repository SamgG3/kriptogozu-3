// components/Notifications.jsx
import React from 'react'

const t = ts => new Date(ts).toLocaleTimeString('tr-TR',{hour12:false})

export default function Notifications({items=[]}){
  return (
    <div className="border border-neutral-800 rounded-2xl p-4 bg-neutral-900/80">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Bildirimler</div>
        <div className="text-[11px] text-neutral-500">{items.length} kayıt</div>
      </div>
      <div className="mt-3 space-y-2 max-h-64 overflow-auto pr-1">
        {items.length===0 && <div className="text-sm text-neutral-400">Henüz bildirim yok.</div>}
        {items.map((s,i)=>(
          <div key={i} className="flex items-center justify-between text-sm border-b border-neutral-800 pb-1">
            <div>
              <div className="text-neutral-200"><b>{s.symbol}</b> • {s.side}</div>
              <div className="text-[11px] text-neutral-500">{s.reason}</div>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-neutral-800/80 border border-neutral-700">
                Güven {Math.round(s.confidence)}%
              </span>
              <div className="text-[11px] text-neutral-500 mt-1">{t(s.time)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
