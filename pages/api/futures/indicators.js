// /api/futures/indicators?symbol=BTCUSDT&interval=1m&limit=300&series=1
// RSI(14), EMA(20), Bollinger(20,2), StochRSI(14,3,3)
function ema(values, period) {
  const k = 2 / (period + 1);
  let emaPrev = values.slice(0, period).reduce((a,b)=>a+b,0) / period;
  const out = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period) { out.push(null); continue; }
    emaPrev = values[i] * k + emaPrev * (1 - k);
    out.push(emaPrev);
  }
  return out;
}
function sma(values, period) {
  const out = []; let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]; if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}
function stddev(values, period) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    const slice = values.slice(i - period + 1, i + 1);
    const m = slice.reduce((a,b)=>a+b,0) / period;
    const v = slice.reduce((a,b)=>a + (b - m) * (b - m), 0) / period;
    out.push(Math.sqrt(v));
  }
  return out;
}
function rsi(values, period = 14) {
  const gains = [], losses = [];
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i-1];
    gains.push(Math.max(d, 0)); losses.push(Math.max(-d, 0));
  }
  let avgGain = gains.slice(0, period).reduce((a,b)=>a+b,0) / period;
  let avgLoss = losses.slice(0, period).reduce((a,b)=>a+b,0) / period;
  const out = new Array(period).fill(null);
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period-1) + gains[i]) / period;
    avgLoss = (avgLoss * (period-1) + losses[i]) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / (avgLoss || 1e-12);
    out.push(100 - (100 / (1 + rs)));
  }
  out.unshift(null);
  return out;
}
// StochRSI(14,3,3)
function stochRsi(rsiArr, stochPeriod = 14, smoothK = 3, smoothD = 3) {
  const raw = rsiArr.map(()=>null);
  for (let i = 0; i < rsiArr.length; i++) {
    if (i < stochPeriod) continue;
    const win = rsiArr.slice(i - stochPeriod + 1, i + 1).filter(v => v != null);
    if (win.length < stochPeriod) continue;
    const cur = rsiArr[i], min = Math.min(...win), max = Math.max(...win);
    raw[i] = max === min ? 50 : ((cur - min) / (max - min)) * 100;
  }
  const k = sma(raw.map(v => v ?? 0), smoothK).map((v,i)=> raw[i]==null ? null : v);
  const d = sma(k.map(v => v ?? 0), smoothD).map((v,i)=> k[i]==null ? null : v);
  return { k, d };
}
const round = (n,d=2)=> n==null?null:Math.round(n*10**d)/10**d;
const roundArr = (arr,d=2)=> arr.map(v=>v==null?null:round(v,d));

export default async function handler(req, res) {
  try {
    const { symbol = "BTCUSDT", interval = "1m", limit = "300", series } = req.query;
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${encodeURIComponent(limit)}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return res.status(r.status).json({ error: `Binance error ${r.status}` });
    const klines = await r.json();
    const closes = klines.map(k => parseFloat(k[4]));

    const EMA_PERIOD = 20, BB_PERIOD = 20, BB_STD = 2, RSI_PERIOD = 14;

    const ema20 = ema(closes, EMA_PERIOD);
    const sma20 = sma(closes, BB_PERIOD);
    const sd20  = stddev(closes, BB_PERIOD);
    const bbUpper = sma20.map((m,i)=> (m==null||sd20[i]==null) ? null : m + BB_STD*sd20[i]);
    const bbLower = sma20.map((m,i)=> (m==null||sd20[i]==null) ? null : m - BB_STD*sd20[i]);
    const rsi14   = rsi(closes, RSI_PERIOD);
    const { k: stochK, d: stochD } = stochRsi(rsi14, 14, 3, 3);

    const last = closes.length - 1;
    const body = {
      symbol, interval, count: closes.length,
      latest: {
        close:   round(closes[last]),
        ema20:   round(ema20[last]),
        sma20:   round(sma20[last]),
        bbUpper: round(bbUpper[last]),
        bbLower: round(bbLower[last]),
        rsi14:   round(rsi14[last]),
        stochK:  round(stochK[last]),
        stochD:  round(stochD[last]),
      }
    };

    // İstenirse son 120 noktanın serisini ekle
    if (series === "1") {
      const take = 120;
      const slice = (a)=> a.slice(-take);
      body.series = {
        closes:  roundArr(slice(closes)),
        ema20:   roundArr(slice(ema20)),
        bbUpper: roundArr(slice(bbUpper)),
        bbLower: roundArr(slice(bbLower)),
        rsi14:   roundArr(slice(rsi14)),
        stochK:  roundArr(slice(stochK)),
        stochD:  roundArr(slice(stochD)),
      };
    }

    return res.status(200).json(body);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}



