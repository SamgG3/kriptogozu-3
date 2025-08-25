// pages/coin/[symbol].js
import React, { useMemo, useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import TPSLPanel from '../../components/TPSLPanel'
import TrendBadge from '../../components/TrendBadge'
import Notifications from '../../components/Notifications'
import { findSR } from '../../lib/sr'
import { generateSignalFromOHLC } from '../../lib/signals'

export default function CoinDynamicPage(){
  const router = useRouter()
  const symbol = (router.query.symbol || 'BTCUSDT').toString().toUpperCase()
  const REFRESH_MS = 3000

  const [ohlc, setOhlc] = useState([])
  const [price, setPrice] = useState(0)
  const [decimals, setDecimals] = useState(2)
  const [signals, setSignals] = useState([])

  useEffect(()=>{
    if (!symbol) return
    async function load(){
      const r = await fetch(`/api/futures/price?symbol=${symbol}`)
      const data = await r.json()
      setOhlc(data.ohlc || [])
      setPrice(data.price ?? 0)
      setDecimals(data.priceDecimals ?? 2)
    }
    load()
    const id = setInterval(load, REFRESH_MS)
    return ()=>clearInterval(id)
  }, [symbol])

  const levels = useMemo(()=> findSR(ohlc, 200), [ohlc])

  useEffect(()=>{
    const id = setInterval(()=>{
      if (!ohlc.length) return
      const s = generateSignalFromOHLC(ohlc)
      if (s) setSignals(prev => [{ ...s, symbol }, ...prev].slice(0, 50))
    }, REFRESH_MS)
    return ()=>clearInterval(id)
  }, [ohlc, symbol])

  return (
    <div className="max-w-6xl mx-auto p-4 md:grid md:grid-cols-[2fr,1fr] md:gap-6">
      <section className="space-y-6">
        <div>
          <div className="text-lg font-semibold">{symbol}</div>
          <div className="text-neutral-400">
            Fiyat: <b className="text-neutral-200">{Number(price).toFixed(decimals)}</b>
          </div>
        </div>

        <TPSLPanel price={price} priceDecimals={decimals} levels={levels} />

        <div className="grid grid-cols-2 gap-8 mt-2">
          <div>
            <div className="text-[11px] text-neutral-400 mb-1">Destek</div>
            {(levels.filter(l=>l.kind==='support').sort((a,b)=>b.price-a.price).slice(0,4)).map((s,i)=>(
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-neutral-300">{s.price.toFixed(decimals)}</span>
                <span className="text-[11px] text-neutral-500">güç {s.strength}/5</span>
              </div>
            ))}
          </div>
          <div>
            <div className="text-[11px] text-neutral-400 mb-1">Direnç</div>
            {(levels.filter(l=>l.kind==='resistance').sort((a,b)=>a.price-b.price).slice(0,4)).map((r,i)=>(
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-neutral-300">{r.price.toFixed(decimals)}</span>
                <span className="text-[11px] text-neutral-500">güç {r.strength}/5</span>
              </div>
            ))}
          </div>
        </div>

        <TrendBadge ohlc={ohlc} priceDecimals={decimals} />
        <p className="mt-2 text-[11px] text-neutral-400">
          Otomatik S/R & trend hesaplaması kullanılır — <span className="underline">yanılma payı vardır</span>.
        </p>
      </section>

      <aside className="mt-6 md:mt-0">
        <Notifications items={signals} />
      </aside>
    </div>
  )
}
