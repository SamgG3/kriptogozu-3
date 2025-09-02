// pages/api/signals.js
// 15m kırılım (Donchian20) tabanlı sinyal üretimi + canlı fiyat.
// Entry = HHV20/LLV20 (retest seviyesi), SL = son pivot (fallback ATR),
// TP1/TP2/TP3 = R-multiples (1.0R / 1.5R / 2.0R).

export default async function handler(req, res) {
  const SYMBOLS = [
    "BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT",
    "AVAXUSDT","XRPUSDT","ADAUSDT","DOGEUSDT"
    // İstersen burayı büyüt.
  ];

  // --- Yardımcılar ---
  const k2 = (k)=>({ // Binance kline -> obj
    openTime:+k[0], open:+k[1], high:+k[2], low:+k[3], close:+k[4], closeTime:+k[6]
  });

  const atr14 = (arr)=>{ // prev datadan
    if (arr.length < 15) return null;
    const trs = [];
    for (let i=1;i<arr.length;i++){
      const h=arr[i].high, l=arr[i].low, pc=arr[i-1].close;
      const tr = Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc));
      trs.push(tr);
    }
    const last14 = trs.slice(-14);
    return last14.reduce((a,b)=>a+b,0)/14;
  };

  const lastPivotLow = (arr, look=10)=>{ // son pivot low (current hariç)
    const end = arr.length-2, start = Math.max(1, end - look);
    for (let i=end; i>=start; i--){
      if (arr[i].low < arr[i-1].low && arr[i].low < arr[i+1].low) return arr[i].low;
    }
    return Math.min(...arr.slice(start, end+1).map(x=>x.low));
  };
  const lastPivotHigh = (arr, look=10)=>{
    const end = arr.length-2, start = Math.max(1, end - look);
    for (let i=end; i>=start; i--){
      if (arr[i].high > arr[i-1].high && arr[i].high > arr[i+1].high) return arr[i].high;
    }
    return Math.max(...arr.slice(start, end+1).map(x=>x.high));
  };

  const mkSignal = (symbol, arr, priceNow)=>{
    const n = arr.length; if (n < 22) return null;
    const prev20 = arr.slice(n-21, n-1);            // son 20 (current hariç)
    const hh = Math.max(...prev20.map(x=>x.high));  // HHV20
    const ll = Math.min(...prev20.map(x=>x.low));   // LLV20
    const cur = arr[n-1];                           // current 15m mum
    const c = cur.close;

    const atr = atr14(arr.slice(0, n-1)) || 0;

    let side=null, entry, sl;
    if (c > hh) { // LONG kırılım
      side = "LONG";
      entry = hh;                                  // retest seviyesi
      sl = lastPivotLow(arr, 10);
      if (!isFinite(sl) || entry - sl < atr*0.2) sl = entry - (atr || entry*0.002);
    } else if (c < ll) { // SHORT kırılım
      side = "SHORT";
      entry = ll;
      sl = lastPivotHigh(arr, 10);
      if (!isFinite(sl) || sl - entry < atr*0.2) sl = entry + (atr || entry*0.002);
    } else {
      return null; // kırılım yok
    }

    const R = Math.abs(entry - sl);
    const tp1 = side==="LONG" ? entry + 1.0*R : entry - 1.0*R;
    const tp2 = side==="LONG" ? entry + 1.5*R : entry - 1.5*R;
    const tp3 = side==="LONG" ? entry + 2.0*R : entry - 2.0*R;

    const t = cur.closeTime; // kırılım mumu zamanı

    return {
      id: `${symbol}-${t}-${side}`,
      symbol,
      price: priceNow,
      side,
      entry, sl, tp1, tp2, tp3,
      status: "new",
      createdAt: t,
      updatedAt: t,
    };
  };

  // --- Canlı fiyat haritası ---
  let priceMap = {};
  try {
    const r = await fetch("https://fapi.binance.com/fapi/v1/ticker/price", { cache:"no-store" });
    const arr = await r.json();
    for (const it of arr) if (SYMBOLS.includes(it.symbol)) priceMap[it.symbol] = Number(it.price);
  } catch {}

  // --- Her sembol için 15m kline çek -> sinyal üret ---
  const signals = [];
  await Promise.all(SYMBOLS.map(async (sym)=>{
    try {
      const u = `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=15m&limit=100`;
      const r = await fetch(u, { cache:"no-store" });
      const raw = await r.json();
      if (!Array.isArray(raw)) return;
      const arr = raw.map(k2);
      const price = priceMap[sym] ?? arr[arr.length-1]?.close;
      const sig = mkSignal(sym, arr, Number(price));
      if (sig) signals.push(sig);
    } catch {}
  }));

  // Geliş sırası (yeni üstte)
  signals.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));

  res.setHeader("Cache-Control","no-store");
  res.status(200).json({ signals });
}
