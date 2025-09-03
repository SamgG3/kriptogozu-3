// pages/api/signals.js
// Tüm USDT perpetual (opsiyonel) için 15m KAPANMIŞ mumla kırılım taraması.
// LONG: close >= HHV20 (önceki 20 mum) | SHORT: close <= LLV20
// Entry = kırılan seviye (retest), SL = son pivot (fallback ATR), TP1/2/3 = R (1.0/1.5/2.0)

export default async function handler(req, res) {
  const ALL = req.query.all === "1" || process.env.SCAN_ALL === "1";
  const MAX_SYMBOLS = ALL ? Number.POSITIVE_INFINITY : Number(process.env.MAX_SYMBOLS || req.query.n || 80);
  const CONC = Number(process.env.SCAN_CONCURRENCY || 10);
  const KLINE_LIMIT = Number(process.env.KLINE_LIMIT || 80);

  // 1) USDT perpetual semboller
  const exInfo = await j("https://fapi.binance.com/fapi/v1/exchangeInfo");
  const allUSDT = exInfo?.symbols?.filter(s =>
    s.contractType === "PERPETUAL" && s.quoteAsset === "USDT" && s.status === "TRADING"
  ).map(s => s.symbol) || [];

  // 2) Likiditeye göre sırala
  const t24 = await j("https://fapi.binance.com/fapi/v1/ticker/24hr");
  const vol = {};
  for (const it of (Array.isArray(t24) ? t24 : [])) if (allUSDT.includes(it.symbol)) vol[it.symbol] = Number(it.quoteVolume || 0);
  const symbols = [...allUSDT].sort((a,b)=>(vol[b]||0)-(vol[a]||0)).slice(0, MAX_SYMBOLS);

  // 3) Canlı fiyatlar
  const tickers = await j("https://fapi.binance.com/fapi/v1/ticker/price");
  const priceMap = {};
  for (const it of (Array.isArray(tickers) ? tickers : [])) if (symbols.includes(it.symbol)) priceMap[it.symbol] = Number(it.price);

  // 4) Tarama (kapalı bar ile)
  const signals = [];
  await mapLimit(symbols, CONC, async (sym) => {
    const u = `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=15m&limit=${KLINE_LIMIT}`;
    const raw = await j(u);
    if (!Array.isArray(raw) || raw.length < 22) return;

    const arr = raw.map(k => ({ openTime:+k[0], open:+k[1], high:+k[2], low:+k[3], close:+k[4], closeTime:+k[6] }));

    const n = arr.length;
    const curIdx = n - 2;                              // SON KAPANAN mum
    const prev20 = arr.slice(curIdx - 20, curIdx);     // önceki 20 kapalı mum
    if (prev20.length < 20) return;

    const hh = Math.max(...prev20.map(x=>x.high));
    const ll = Math.min(...prev20.map(x=>x.low));
    const cur = arr[curIdx];
    const c   = cur.close;

    // ATR14 ve pivotlar (kapalı veriyle)
    const histForAtr = arr.slice(0, curIdx);           // current hariç
    const atr = atr14(histForAtr);
    const pl  = pivotLow(arr, curIdx);
    const ph  = pivotHigh(arr, curIdx);

    let side=null, entry, sl;
    if (c >= hh) {                                     // LONG kırılım
      side  = "LONG";
      entry = hh;
      sl    = Number.isFinite(pl) ? pl : Math.min(...arr.slice(curIdx-11, curIdx+1).map(x=>x.low));
      if (!isFinite(sl) || (entry - sl) < (atr*0.2 || entry*0.002)) sl = entry - (atr || entry*0.002);
    } else if (c <= ll) {                               // SHORT kırılım
      side  = "SHORT";
      entry = ll;
      sl    = Number.isFinite(ph) ? ph : Math.max(...arr.slice(curIdx-11, curIdx+1).map(x=>x.high));
      if (!isFinite(sl) || (sl - entry) < (atr*0.2 || entry*0.002)) sl = entry + (atr || entry*0.002);
    } else {
      return; // kırılım yok
    }

    const R   = Math.abs(entry - sl);
    const tp1 = side==="LONG" ? entry + 1.0*R : entry - 1.0*R;
    const tp2 = side==="LONG" ? entry + 1.5*R : entry - 1.5*R;
    const tp3 = side==="LONG" ? entry + 2.0*R : entry - 2.0*R;

    const price = Number(priceMap[sym] ?? cur.close);

    signals.push({
      id: `${sym}-${cur.closeTime}-${side}`,
      symbol: sym,
      price, side, entry, sl, tp1, tp2, tp3,
      status: "new",
      createdAt: cur.closeTime,
      updatedAt: cur.closeTime,
    });
  });

  signals.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));
  res.setHeader("Cache-Control","no-store");
  res.status(200).json({ signals, meta:{ scanned: symbols.length, totalUSDT: allUSDT.length } });
}

/* ---------- yardımcılar ---------- */
async function j(url){ try{ const r=await fetch(url,{cache:"no-store"}); if(!r.ok) return null; return await r.json(); } catch{ return null; } }

async function mapLimit(items, limit, fn){
  const running = new Set();
  for (const it of items){
    const p = Promise.resolve().then(()=>fn(it)).finally(()=>running.delete(p));
    running.add(p);
    if (running.size >= limit) await Promise.race(running);
  }
  await Promise.allSettled([...running]);
}

function atr14(arr){
  if (!arr || arr.length < 15) return 0;
  const trs=[];
  for (let i=1;i<arr.length;i++){
    const h=arr[i].high, l=arr[i].low, pc=arr[i-1].close;
    trs.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)));
  }
  const last14 = trs.slice(-14);
  return last14.reduce((a,b)=>a+b,0)/14;
}

// curIdx'e kadar son pivot low/high
function pivotLow(arr, curIdx, look=10){
  const end = curIdx, start = Math.max(1, end - look);
  for (let i=end; i>=start; i--){
    if (arr[i].low < arr[i-1].low && arr[i].low < arr[i+1].low) return arr[i].low;
  }
  return NaN;
}
function pivotHigh(arr, curIdx, look=10){
  const end = curIdx, start = Math.max(1, end - look);
  for (let i=end; i>=start; i--){
    if (arr[i].high > arr[i-1].high && arr[i].high > arr[i+1].high) return arr[i].high;
  }
  return NaN;
}
