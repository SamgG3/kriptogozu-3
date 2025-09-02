// pages/api/signals.js
// Binance Futures USDT perpetual TÜM semboller (opsiyonel), 15m kırılım (Donchian20), R-TP1/2/3.
// Varsayılan: en likit ilk 80'i tarar (time-out riski azaltmak için).
// Hepsi: /api/signals?all=1  ya da  env: SCAN_ALL=1
// Ayarlar (env veya query ile override): MAX_SYMBOLS, SCAN_CONCURRENCY, KLINE_LIMIT

export default async function handler(req, res) {
  const ALL = req.query.all === "1" || process.env.SCAN_ALL === "1";
  const MAX_SYMBOLS = ALL
    ? Number.POSITIVE_INFINITY
    : Number(process.env.MAX_SYMBOLS || req.query.n || 80);
  const CONC = Number(process.env.SCAN_CONCURRENCY || 10);  // aynı anda istek
  const KLINE_LIMIT = Number(process.env.KLINE_LIMIT || 80); // 15m mum sayısı

  // --- 1) Tüm USDT perpetual sembolleri al ---
  const exInfo = await fetchJSON("https://fapi.binance.com/fapi/v1/exchangeInfo");
  const allUSDT = exInfo?.symbols
    ?.filter(s => s.contractType === "PERPETUAL" && s.quoteAsset === "USDT" && s.status === "TRADING")
    ?.map(s => s.symbol) || [];

  // --- 2) 24h hacme göre sırala (en likitler önce) ---
  const t24 = await fetchJSON("https://fapi.binance.com/fapi/v1/ticker/24hr");
  const volMap = {};
  for (const it of (Array.isArray(t24) ? t24 : [])) {
    if (allUSDT.includes(it.symbol)) volMap[it.symbol] = Number(it.quoteVolume || 0);
  }
  const symbols = [...allUSDT].sort((a,b) => (volMap[b]||0) - (volMap[a]||0))
                              .slice(0, MAX_SYMBOLS);

  // --- 3) Canlı fiyatlar ---
  const tickers = await fetchJSON("https://fapi.binance.com/fapi/v1/ticker/price");
  const priceMap = {};
  for (const it of (Array.isArray(tickers) ? tickers : [])) {
    if (symbols.includes(it.symbol)) priceMap[it.symbol] = Number(it.price);
  }

  // --- 4) Her sembol için 15m klines -> kırılım kontrolü ---
  const signals = [];
  await mapLimit(symbols, CONC, async (sym) => {
    const u = `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=15m&limit=${KLINE_LIMIT}`;
    const raw = await fetchJSON(u);
    if (!Array.isArray(raw)) return;

    const arr = raw.map(k => ({
      openTime: +k[0],
      open: +k[1],
      high: +k[2],
      low:  +k[3],
      close:+k[4],
      closeTime:+k[6],
    }));
    if (arr.length < 22) return;

    const n = arr.length;
    const prev20 = arr.slice(n-21, n-1);           // son 20 (mevcut mum hariç)
    const hh = Math.max(...prev20.map(x => x.high));
    const ll = Math.min(...prev20.map(x => x.low));
    const cur = arr[n-1];
    const c   = cur.close;

    // ATR14 (mevcut mum hariç)
    const atr = calcATR14(arr.slice(0, n-1));

    // Son pivotlar (fallback: min/max)
    const pl = lastPivotLow(arr);
    const ph = lastPivotHigh(arr);

    let side = null, entry, sl;
    if (c > hh) {                   // LONG kırılım
      side = "LONG";
      entry = hh;                   // retest seviyesi
      sl = Number.isFinite(pl) ? pl : Math.min(...arr.slice(n-12, n-1).map(x=>x.low));
      if (!isFinite(sl) || (entry - sl) < atr*0.2) sl = entry - (atr || entry*0.002);
    } else if (c < ll) {            // SHORT kırılım
      side = "SHORT";
      entry = ll;
      sl = Number.isFinite(ph) ? ph : Math.max(...arr.slice(n-12, n-1).map(x=>x.high));
      if (!isFinite(sl) || (sl - entry) < atr*0.2) sl = entry + (atr || entry*0.002);
    } else {
      return; // kırılım yok
    }

    const R = Math.abs(entry - sl);
    const tp1 = side === "LONG" ? entry + 1.0*R : entry - 1.0*R;
    const tp2 = side === "LONG" ? entry + 1.5*R : entry - 1.5*R;
    const tp3 = side === "LONG" ? entry + 2.0*R : entry - 2.0*R;

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

  // yeni -> üste
  signals.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    signals,
    meta: { scanned: symbols.length, totalUSDT: allUSDT.length, all: ALL }
  });
}

/* --------------- Yardımcılar --------------- */
async function fetchJSON(url) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function mapLimit(items, limit, fn) {
  const executing = new Set();
  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item)).finally(() => executing.delete(p));
    executing.add(p);
    if (executing.size >= limit) await Promise.race(executing);
  }
  await Promise.allSettled(Array.from(executing));
}

function calcATR14(arr) {
  if (arr.length < 15) return 0;
  const trs = [];
  for (let i=1;i<arr.length;i++){
    const h=arr[i].high, l=arr[i].low, pc=arr[i-1].close;
    trs.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)));
  }
  const last14 = trs.slice(-14);
  return last14.reduce((a,b)=>a+b,0)/14;
}

function lastPivotLow(arr, look=10){
  const end = arr.length-2, start = Math.max(1, end - look);
  for (let i=end; i>=start; i--){
    if (arr[i].low < arr[i-1].low && arr[i].low < arr[i+1].low) return arr[i].low;
  }
  return NaN;
}
function lastPivotHigh(arr, look=10){
  const end = arr.length-2, start = Math.max(1, end - look);
  for (let i=end; i>=start; i--){
    if (arr[i].high > arr[i-1].high && arr[i].high > arr[i+1].high) return arr[i].high;
  }
  return NaN;
}
