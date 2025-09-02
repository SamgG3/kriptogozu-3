// pages/api/signals.js
// Canlı fiyat: Binance Futures (USDT perpetual) -> /fapi/v1/ticker/price
// TP1/TP2/TP3 = R-multiples (1.0R / 1.5R / 2.0R)

export default async function handler(req, res) {
  const now = Date.now();

  // Takip edeceğin semboller (şimdilik örnek; istediğin kadar ekleyebilirsin)
  const SYMBOLS = [
    "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT",
    "AVAXUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT",
  ];

  // 1) Binance'tan canlı fiyatları çek (tek istek)
  let priceMap = {};
  try {
    const r = await fetch("https://fapi.binance.com/fapi/v1/ticker/price", { cache: "no-store" });
    const arr = await r.json();
    for (const it of arr) {
      if (SYMBOLS.includes(it.symbol)) priceMap[it.symbol] = Number(it.price);
    }
  } catch (e) {
    // Fiyat çekemezsek boş kalsın; aşağıda entry'yi fallback kullanırız
  }

  // 2) Basit sinyaller (örnek) — gerçek motorda bunlar tarayıcıdan gelecek
  const seed = [
    //  symbol,   side,    entry,    sl,   minsAgo
    ["BTCUSDT", "LONG",  62380.0, 61940.0,   2],
    ["SOLUSDT", "SHORT",   142.1,   144.0,   4],
    ["ETHUSDT", "LONG",   4310.0,  4275.0,   5],
    ["BNBUSDT", "SHORT",   850.5,   864.0,   6],
    ["AVAXUSDT","LONG",    28.10,   27.40,   7],
    ["XRPUSDT", "SHORT",  0.5590,  0.5710,   8],
    ["ADAUSDT", "LONG",   0.4800,  0.4680,   9],
    ["DOGEUSDT","SHORT",  0.1210,  0.1255,  10],
  ];

  const make = (symbol, side, entry, sl, minsAgo) => {
    const price = Number(priceMap[symbol] ?? entry); // canlı fiyat yoksa entry'yi kullan
    const R = Math.abs(entry - sl);
    const isLong = String(side).toUpperCase() === "LONG";
    const tp1 = isLong ? entry + 1.0 * R : entry - 1.0 * R;
    const tp2 = isLong ? entry + 1.5 * R : entry - 1.5 * R;
    const tp3 = isLong ? entry + 2.0 * R : entry - 2.0 * R;
    const t = now - minsAgo * 60_000;

    return {
      id: `${symbol}-${t}-${side}`,
      symbol,
      price,
      side: isLong ? "LONG" : "SHORT",
      entry,
      sl,
      tp1, tp2, tp3,
      status: "new",                 // "new"/"active" görünür
      createdAt: t,
      updatedAt: t,
    };
  };

  const signals = seed.map(args => make(...args));

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ signals });
}
