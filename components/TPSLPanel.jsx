// components/TPSLPanel.jsx
import React from 'react'
import { tpsFromSR, slFromSR } from '../lib/sr'

const fmt = (v, d=2) => (v==null ? '-' : Number(v).toFixed(d))

export default function TPSLPanel({ price, priceDecimals=2, levels=[] }) {
  const longTP  = tpsFromSR('long',  price, levels)
  const shortTP = tpsFromSR('short', price, levels)
  const longSL  = slFromSR('long',  price, levels)
  const shortSL = slFromSR('short', price, levels)

  return (
    <div className="grid grid-cols-2 gap-12">
      <div>
        <div className="text-xs text-neutral-400 mb-1">Long TP/SL</div>
        <ul className="space-y-1 text-sm">
          <li>TP1: <b>{fmt(longTP.tp1,  priceDecimals)}</b></li>
          <li>TP2: <b>{fmt(longTP.tp2,  priceDecimals)}</b></li>
          <li>TP3: <b>{fmt(longTP.tp3,  priceDecimals)}</b></li>
          <li>SL:  <b>{fmt(longSL,      priceDecimals)}</b></li>
        </ul>
      </div>
      <div>
        <div className="text-xs text-neutral-400 mb-1">Short TP/SL</div>
        <ul className="space-y-1 text-sm">
          <li>TP1: <b>{fmt(shortTP.tp1, priceDecimals)}</b></li>
          <li>TP2: <b>{fmt(shortTP.tp2, priceDecimals)}</b></li>
          <li>TP3: <b>{fmt(shortTP.tp3, priceDecimals)}</b></li>
          <li>SL:  <b>{fmt(shortSL,     priceDecimals)}</b></li>
        </ul>
      </div>
    </div>
  )
}
