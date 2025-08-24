// /api/futures/indicators?symbol=BTCUSDT&interval=1m&limit=300
// Binance Futures klines verisini çeker, RSI(14), EMA(20) ve Bollinger(20,2) hesaplar.
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
  const out = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
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
    const v = slice.reduce((a,b)=>a + Math.pow(b - m,2), 0) / period;
    out.push(Math.sqrt(v));
  }
  return out;
}

function rsi(values, period = 14) {
  const gains = [], losses = [];
  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i-1];
    gains.push(Math.max(diff, 0));
    losses.push(Math.max(-diff, 0));
  }
  // Wilder's smoothing
  let avgGain = gains.slice(0, period).reduce((a,b)=>a+b,0) / period;
  let avgLoss = losses.slice(0, period).reduce((a,b)=>a+b,0) / period;
  const out = new Array(period).fill(null); // ilk period için null
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period-1) + gains[i]) / period;
    avgLoss = (avgLoss * (period-1) + losses[i]) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / (avgLoss || 1e-12);
    const rsi = 100 - (100 / (1 + rs));
    out.push(rsi);
  }
  out.unshift(null); // uzunluk eşitlensin
  return out;
}

export default async function handler(req, res) {
  try {
    const { symbol = "BTCUSDT", interval = "1m", limit = "300" } = req.query;
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${encodeURIComponent(limit)}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return res.status(r.status).json({ error: `Binance error ${r.status}` });
    const klines = await r.json();

    // Kline formatı: [ openTime, open, high, low, close, volume, ... ]
    const closes = klines.map(k => parseFloat(k[4]));

    // Hesaplamalar
    const EMA_PERIOD = 20;
    const BB_PERIOD = 20;
    const BB_STD = 2;
    const RSI_PERIOD = 14;

    const ema20 = ema(closes, EMA_PERIOD);
    const sma20 = sma(closes, BB_PERIOD);
    const sd20  = stddev(closes, BB_PERIOD);

    const bbUpper = sma20.map((m,i) => (m==null || sd20[i]==null) ? null : m + BB_STD*sd20[i]);
    const bbLower = sma20.map((m,i) => (m==null || sd20[i]==null) ? null : m - BB_STD*sd20[i]);
    const rsi14   = rsi(closes, RSI_PERIOD);

    const last = closes.length - 1;

    return res.status(200).json({
      symbol,
      interval,
      count: closes.length,
      latest: {
        close: closes[last],
        ema20: ema20[last],
        sma20: sma20[last],
        bbUpper: bbUpper[last],
        bbLower: bbLower[last],
        rsi14: rsi14[last]
      },
      series: {
        closes,
        ema20,
        sma20,
        bbUpper,
        bbLower,
        rsi14
      }
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
