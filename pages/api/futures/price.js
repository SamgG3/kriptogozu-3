// pages/api/futures/price.js
export default async function handler(req, res) {
  // URL: /api/futures/price?symbols=BTCUSDT,ETHUSDT
  const symbolsParam = (req.query.symbols || "BTCUSDT,ETHUSDT").toString();
  const symbols = symbolsParam.split(",").map(s => s.trim().toUpperCase());

  try {
    const results = await Promise.all(
      symbols.map(async (sym) => {
        const url = `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${sym}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error("Binance API error");
        const j = await r.json();
        return [sym, j.price];
      })
    );

    res.status(200).json(Object.fromEntries(results));
  } catch (e) {
    res.status(500).json({ error: "binance_failed" });
  }
}
