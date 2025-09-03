// ===============================
// FILE: pages/api/signals.js
// ===============================
// Binance Futures (USDT-Perpetual) tarayıcısı — 15m kapalı mum kırılımı (Donchian20)
// Entry = HHV20/LLV20 (retest), SL = pivot (fallback ATR), TP1/2/3 = R (1.0/1.5/2.0)
// Canlı fiyat, hacim sıralama, isteğe bağlı maliyet filtresi (fee + funding), risk tabanlı qty önerisi.
// UI minimal kalır; bu alanlar API’de gömülü döner.
//
// ENV (opsiyonel):
//  - SCAN_ALL=1                 -> tüm USDT-PERP taransın (aksi: en likit ilk MAX_SYMBOLS)
//  - MAX_SYMBOLS=120            -> taranacak sembol sayısı (ALL değilse)
//  - SCAN_CONCURRENCY=10        -> aynı anda kaç kline isteği
//  - KLINE_LIMIT=80             -> 15m mum sayısı
//  - ENABLE_COST_FILTER=0/1     -> maliyet filtresi aktif
//  - FEE_SIDE=maker|taker       -> varsayılan maker
//  - FEE_MAKER=0.0002           -> %0.02
//  - FEE_TAKER=0.0004           -> %0.04
//  - MIN_NET_EDGE_PCT=0.0000    -> net edge alt sınırı (örn 0.001 = %0.1)
//  - RISK_USDT=50               -> pozisyon başı risk bütçesi (qty önerisi için)
//
export default async function handler(req, res) {
  const ALL = req.query.all === '1' || process.env.SCAN_ALL === '1';
  const MAX_SYMBOLS = ALL ? Number.POSITIVE_INFINITY : num(process.env.MAX_SYMBOLS, num(req.query.n, 120));
  const CONC = num(process.env.SCAN_CONCURRENCY, 10);
  const KLINE_LIMIT = num(process.env.KLINE_LIMIT, 80);

  const ENABLE_COST_FILTER = (process.env.ENABLE_COST_FILTER === '1');
  const FEE_SIDE = (process.env.FEE_SIDE || 'maker').toLowerCase();
  const FEE_MAKER = num(process.env.FEE_MAKER, 0.0002);
  const FEE_TAKER = num(process.env.FEE_TAKER, 0.0004);
  const MIN_NET_EDGE_PCT = num(process.env.MIN_NET_EDGE_PCT, 0.0);
  const RISK_USDT = num(process.env.RISK_USDT, 50);

  // 1) Borsa enformasyonu — tüm USDT-PERP (TRADING)
  const exInfo = await j('https://fapi.binance.com/fapi/v1/exchangeInfo');
  const allUSDT = exInfo?.symbols?.filter(s => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING').map(s => s.symbol) || [];

  // 2) 24h hacme göre sırala ve kısıtla
  const t24 = await j('https://fapi.binance.com/fapi/v1/ticker/24hr');
  const vol = {};
  for (const it of (Array.isArray(t24) ? t24 : [])) if (allUSDT.includes(it.symbol)) vol[it.symbol] = Number(it.quoteVolume || 0);
  const symbols = [...allUSDT].sort((a,b)=>(vol[b]||0)-(vol[a]||0)).slice(0, MAX_SYMBOLS);

  // 3) Canlı fiyatlar
  const tickers = await j('https://fapi.binance.com/fapi/v1/ticker/price');
  const priceMap = {};
  for (const it of (Array.isArray(tickers) ? tickers : [])) if (symbols.includes(it.symbol)) priceMap[it.symbol] = Number(it.price);

  // 4) Tarama — kapalı mumla kırılım
  const out = [];
  let scanned = 0;

  await mapLimit(symbols, CONC, async (sym) => {
    const u = `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=15m&limit=${KLINE_LIMIT}`;
    const raw = await j(u);
    if (!Array.isArray(raw) || raw.length < 22) return;

    const arr = raw.map(k => ({ openTime:+k[0], open:+k[1], high:+k[2], low:+k[3], close:+k[4], closeTime:+k[6] }));
    const n = arr.length;
    const curIdx = n - 2;                            // SON KAPANAN mum
    const prev20 = arr.slice(curIdx - 20, curIdx);   // önceki 20 kapalı mum
    if (prev20.length < 20) return;

    const hh = Math.max(...prev20.map(x=>x.high));
    const ll = Math.min(...prev20.map(x=>x.low));
    const cur = arr[curIdx];
    const c = cur.close;

    const atr = calcATR14(arr.slice(0, curIdx));
    const pl = pivotLow(arr, curIdx);
    const ph = pivotHigh(arr, curIdx);

    let side=null, entry, sl;
    if (c >= hh) { // LONG
      side = 'LONG';
      entry = hh; // retest seviyesi
      sl = isFiniteNum(pl) ? pl : Math.min(...arr.slice(curIdx-11, curIdx+1).map(x=>x.low));
      if (!isFiniteNum(sl) || (entry - sl) < (atr*0.2 || entry*0.002)) sl = entry - (atr || entry*0.002);
    } else if (c <= ll) { // SHORT
      side = 'SHORT';
      entry = ll;
      sl = isFiniteNum(ph) ? ph : Math.max(...arr.slice(curIdx-11, curIdx+1).map(x=>x.high));
      if (!isFiniteNum(sl) || (sl - entry) < (atr*0.2 || entry*0.002)) sl = entry + (atr || entry*0.002);
    } else {
      scanned++; return; // kırılım yok
    }

    const R = Math.abs(entry - sl) || 0;
    if (R === 0) { scanned++; return; }

    const tp1 = side==='LONG' ? entry + 1.0*R : entry - 1.0*R;
    const tp2 = side==='LONG' ? entry + 1.5*R : entry - 1.5*R;
    const tp3 = side==='LONG' ? entry + 2.0*R : entry - 2.0*R;

    const price = Number(priceMap[sym] ?? cur.close);

    // --- Maliyet filtresi (opsiyonel) ---
    if (ENABLE_COST_FILTER) {
      const gross = Math.abs(tp1 - entry) / entry;                // TP1’e göre brüt getiri (% olarak)
      const fee = ((FEE_SIDE==='taker') ? (2*FEE_TAKER) : (2*FEE_MAKER));
      const fundRate = await fundingRatePerHour(sym);             // saatlik
      const barsToTP1 = Math.max(1, R / Math.max(atr, 1e-9));     // tahmini bar sayısı (1R / ATR)
      const hours = 0.25 * barsToTP1;                             // 15m = 0.25 saat
      const payingSide = (await whoPaysFunding(sym));             // 'LONG'|'SHORT'|null
      const fundingCost = (payingSide && payingSide === side) ? Math.abs(fundRate)*hours : 0;
      const net = gross - fee - fundingCost;
      if (net < MIN_NET_EDGE_PCT) { scanned++; return; }
    }

    // --- Risk tabanlı miktar önerisi (gömülü) ---
    // USDT-margined: yaklaşık risk(USDT) ≈ qty_base * |Entry - SL|
    // => qty_base ≈ RISK_USDT / R
    const qty = RISK_USDT / R; // BASE miktar (ör. BTC)
    const leverage = 5;        // öneri; işleten belirler

    out.push({
      id: `${sym}-${cur.closeTime}-${side}`,
      symbol: sym,
      price, side, entry, sl, tp1, tp2, tp3,
      status: 'new',
      createdAt: cur.closeTime,
      updatedAt: cur.closeTime,
      // gizli alanlar (UI göstermiyor ama API’de mevcut)
      _meta: {
        atr, R, qty, leverage,
      }
    });
    scanned++;
  });

  out.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));

  res.setHeader('Cache-Control','no-store');
  res.status(200).json({ signals: out, meta: { scanned, returned: out.length, totalUSDT: allUSDT.length, all: ALL } });
}

/* -------------------- yardımcılar -------------------- */
function num(v, d){ const x = Number(v); return Number.isFinite(x) ? x : d; }
function isFiniteNum(x){ return typeof x === 'number' && isFinite(x); }

async function j(url){
  try{ const r = await fetch(url,{cache:'no-store'}); if(!r.ok) return null; return await r.json(); }catch{ return null; }
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
  // Binance: lastFundingRate (per 8h). Saatliğe çeviriyoruz.
  try {
    const d = await j(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`);
    const per8h = Math.abs(Number(d?.lastFundingRate || 0));
    return per8h / 8; // ~saatlik
  } catch { return 0; }
}
async function whoPaysFunding(symbol){
  try {
    const d = await j(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`);
    const rate = Number(d?.lastFundingRate || 0);
    if (!isFinite(rate) || rate === 0) return null;
    return rate > 0 ? 'LONG' : 'SHORT';
  } catch { return null; }
}

// ===============================
// PATCH: pages/sinyal.js -> tüm semboller için tarama (opsiyonel)
// ===============================
// Aşağıdaki fetch satırını, İSTERSEN tüm USDT-PERP’leri taramak için ?all=1 ile değiştir:
// const res = await fetch('/api/signals?all=1', { cache: 'no-store' });
