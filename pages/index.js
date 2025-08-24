import { useEffect, useState } from 'react'

export default function Home() {
  const [prices, setPrices] = useState({})
  useEffect(() => {
    fetch('/api/futures/price?symbols=BTCUSDT,ETHUSDT')
      .then(res => res.json()).then(data => setPrices(data))
  }, [])
  return (
    <div style={{ maxWidth: '600px', margin: '40px auto' }}>
      <h1>KriptoGözü • Binance Futures</h1>
      <p>BTC ve ETH fiyatları Binance Futures API'den çekilmektedir.</p>
      <div style={{marginTop:'20px'}}>
        <h2>BTCUSDT: {prices.BTCUSDT || 'Yükleniyor...'}</h2>
        <h2>ETHUSDT: {prices.ETHUSDT || 'Yükleniyor...'}</h2>
      </div>
    </div>
  )
}
