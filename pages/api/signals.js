// pages/api/signals.js
// Binance USDT-Perp tarayıcı — 15m kapalı mum Donchian(20) kırılımı
// Entry = HH/LL (retest), SL = pivot (fallback ATR), TP1/2/3 = R (1.0 / 1.5 / 2.0)
// Canlı fiyat eşlemesi, 24h hacme göre sıralama, çoklu istek; opsiyonel maliyet filtresi ve risk tabanlı qty önerisi.
// Tek dosya. Auto-order YOK.

export default async function handler(req, res) {
  // ---- Ayarlar (query veya ENV) ----
  const ALL = req.query.all === "1" || process.env.SCAN_ALL === "1";
  const MAX_SYMBOLS = ALL ? Number.POSITIVE_INFINITY : getNum(process.env.MAX_SYMBOLS, getNum(req.query.n, 120));
  const CONC = getNum(process.env.SCAN_CONCURRENCY, 10);
  const KLINE_LIMIT = getNum(process.env.KLINE_LIMIT, 80);

  // Maliyet filtresi (opsiyonel)
  const ENABLE_COST_FILTER = process.env.ENABLE_COST_FILTER === "1";
  const FEE_SIDE = (process.env.FEE_SIDE || "maker").toLowerCase(); // maker|taker
  const FEE_MAKER = getNum(process.env.FEE_MAKER, 0.0002);          // %0.02
  const FEE_TAKER = getNum(process.env.FEE_TAKER, 0.0004);          // %0.04
  const MIN_NET_EDGE_PCT = getNum(process.env.MIN_NET_EDGE_PCT, 0.0);

  // Risk tabanlı qty önerisi (UI göstermez, API'de _meta.qty döner)
  const RISK_USDT = getNum(process.env.RISK_USDT, 50);

  // ---- 1) Tüm USDT-Perp (TRADING) listesi ----
  const exInfo = await j("https://fapi.binance.com/fapi/v1/exchangeInfo");
  const allUSDT = exInfo?.symbols
    ?.filter(s => s.contractType === "PERPETUAL" && s.quoteAsset === "USDT" && s.status === "TRADING")
    ?.map(s => s.symbol) || [];

  // ---- 2) 24h hacme göre sırala ve kısıtla ----
  const t24 = await j("https://fapi.binance.com/fapi/v1/ticker/24hr");
  const vol = {};
  for (const it of (Array.isArray(t24) ? t24 : [])) {
    if (allUSDT.includes(it.symbol)) vol[it.symbol] = Number(it.quoteVolume || 0);
  }
  const symbols = [...allUSDT].sort((a, b) => (vol[b] || 0) - (vol[a] || 0)).slice(0, MAX_SYMBOLS);

  // ---- 3) Canlı fiyatlar ----
  const tickers = await j("https://fapi.binance.com/fapi/v1/ticker/price");
  const priceMap = {};
  for (const it of (Array.isArray(tickers) ? tickers : [])) {
    if (symbols.includes(it.symbol)) priceMap[it.symbol] = Number(it.price);
  }

  // ---- 4) Tarama: 15m KAPALI mumla kırılım ----
  const signals = [];
  let scanned = 0;

  await mapLimit(symbols, CONC, async (sym) => {
    const u = `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=15m&limit=${KLINE_LIMIT}`;
    const raw = await j(u);
    if (!Array.isArray(raw) || raw.length < 22) { scanned++; return; }

    const arr = raw.map(k => ({
      openTime: +k[0],
      open: +k[1],
      high: +k[2],
      low:  +k[3],
      close:+k[4],
      closeTime: +k[6],
    }));

    const n = arr.length;
    const curIdx = n - 2;                     // SON KAPANAN mum
    const prev20 = arr.slice(curIdx - 20, curIdx);
    if (prev20.length < 20) { scanned++; return; }

    const hh = Math.max(...prev20.map(x => x.high));
    const ll = Math.min(...prev20.map(x => x.low));
    const cur = arr[curIdx];
    const c   = cur.close;

    const atr = calcATR14(arr.slice(0, curIdx));
    const pl  = pivotLow(arr, curIdx);
    const ph  = pivotHigh(arr, curIdx);

    let side = null, entry, sl;
    if (c >= hh) {                 // LONG kırılım
      side  = "LONG";
      entry = hh;                  // retest seviyesi
      sl    = isNum(pl) ? pl : Math.min(...arr.slice(curIdx-11, curIdx+1).map(x=>x.low));
      if (!isNum(sl) || (entry - sl) < (atr*0.2 || entry*0.002)) sl = entry - (atr || entry*0.002);
    } else if (c <= ll) {          // SHORT kırılım
      side  = "SHORT";
      entry = ll;
      sl    = isNum(ph) ? ph : Math.max(...arr.slice(curIdx-11, curIdx+1).map(x=>x.high));
      if (!isNum(sl) || (sl - entry) < (atr*0.2 || entry*0.002)) sl = entry + (atr || entry*0.002);
    } else {
      scanned++; return;           // kırılım yok
    }

    const R = Math.abs(entry - sl);
    if (!isNum(R) || R === 0) { scanned++; return; }

    const tp1 = side === "LONG" ? entry + 1.0 * R : entry - 1.0 * R;
    const tp2 = side === "LONG" ? entry + 1.5 * R : entry - 1.5 * R;
    const tp3 = side === "LONG" ? entry + 2.0 * R : entry - 2.0 * R;

    const price = Number(priceMap[sym] ?? cur.close);

    // ---- (Opsiyonel) Maliyet filtresi ----
    if (ENABLE_COST_FILTER) {
      const gross = Math.abs(tp1 - entry) / entry;            // TP1 mesafesine göre brüt %
      const fee   = (FEE_SIDE === "taker") ? (2 * FEE_TAKER) : (2 * FEE_MAKER);
      const frPH  = await fundingRatePerHour(sym);            // saatlik funding
      const barsToTP1 = Math.max(1, R / Math.max(atr, 1e-9)); // ~1R/ATR ≈ bar sayısı
      const hours = 0.25 * barsToTP1;                         // 15m = 0.25 saat
      const payer = await whoPaysFunding(sym);                // "LONG" | "SHORT" | null
      const fundingCost = (payer && payer === side) ? Math.abs(frPH) * hours : 0;
      const net = gross - fee - fundingCost;
      if (net < MIN_NET_EDGE_PCT) { scanned++; return; }      // net edge yetersizse ele
    }

    // ---- Risk tabanlı qty önerisi (sadece API meta) ----
    const qty = RISK_USDT / R;  // yaklaşık BASE miktar (USDT-margined için)
    const leverage = 5;

    signals.push({
      id: `${sym}-${cur.closeTime}-${side}`,
      symbol: sym,
      price, side, entry, sl, tp1, tp2, tp3,
      status: "new",
      createdAt: cur.closeTime,
      updatedAt: cur.closeTime,
      _meta: { atr, R, qty, leverage }
    });

    scanned++;
  });

  // yeni üstte
  signals.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    signals,
    meta: { scanned, returned: signals.length, totalUSDT: allUSDT.length, all: ALL }
  });
}

/* --------------- Helpers --------------- */
function getNum(v, d){ const x = Number(v); return Number.isFinite(x) ? x : d; }
function isNum(x){ return typeof x === "number" && Number.isFinite(x); }

async function j(url){
  try{ const r = await fetch(url, { cache: "no-store" }); if (!r.ok) return null; return await r.json(); }
  catch{ return null; }
}
async function mapLimit(items, limit, fn){
  const running = new Set();
  for (const it of items){
    const p = Promise.resolve().then(()=>fn(it)).finally(()=>running.delete(p));
    running.add(p);
    if (running.size >= limit) await Promise.race(running);
  }
  await Promise.allSettled([...running]);
}
function calcATR14(arr){
  if (!arr || arr.length < 15) return 0;
  const trs=[]; for(let i=1;i<arr.length;i++){
    const h=arr[i].high, l=arr[i].low, pc=arr[i-1].close;
    trs.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)));
  }
  const last14 = trs.slice(-14);
  return last14.reduce((a,b)=>a+b,0)/14;
}
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
async function fundingRatePerHour(symbol){
  try{
    const d = await j(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`);
    const per8h = Math.abs(Number(d?.lastFundingRate || 0));
    return per8h / 8;
  } catch { return 0; }
}
async function whoPaysFunding(symbol){
  try{
    const d = await j(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`);
    const rate = Number(d?.lastFundingRate || 0);
    if (!Number.isFinite(rate) || rate === 0) return null;
    return rate > 0 ? "LONG" : "SHORT";
  } catch { return null; }
}
