// pages/coin/index.js
import React, { useMemo, useState, useEffect } from 'react'
import TPSLPanel from '../../components/TPSLPanel'
import TrendBadge from '../../components/TrendBadge'
import Notifications from '../../components/Notifications'
import { findSR } from '../../lib/sr'
import { generateSignalFromOHLC } from '../../lib/signals'

export default function CoinPage(){
  const symbol = 'BTCUSDT'          // İstersen sabit; ya da kendi sembol akışına bağlayabilirsin.
  const REFRESH_MS = 3000

  const [ohlc, setOhlc] = useState([])
  const [price, setPrice] = useState(0)
  const [decimals, setDecimals] = useState(2)
  const [signals, setSignals] = useState([])

  useEffect(()=>{
    async function load(){
      const r = await fetch(`/api/futures/price?symbol=${symbol}`)
      const data = await r.json()
      setOhlc(Array.isArray(data.ohlc) ? data.ohlc : [])
      const p = Number(data.price ?? 0)
      setPrice(p)
      // backend priceDecimals yoksa mantıklı bir varsayım:
      const d = typeof data.priceDecimals === 'number'
        ? data.priceDecimals
        : (p >= 1 ? 2 : 6)
      setDecimals(d)
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
      {/* SOL */}
      <section className="space-y-6">
        <div>
          <div className="text-lg font-semibold">{symbol}</div>
          <div className="text-neutral-400">
            Fiyat: <b className="text-neutral-200">{Number(price).toFixed(decimals)}</b>
          <
