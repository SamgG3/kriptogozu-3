// /api/futures/price?symbols=BTCUSDT,ETHUSDT
export default async function handler(req, res) {
  try {
    const { symbols } = req.query;
    if (!symbols) {
      return res.status(400).json({ error: 'symbols query param is required (e.g., BTCUSDT,ETHUSDT)' });
    }
    const list = decodeURIComponent(symbols).split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

    const results = {};
    await Promise.all(list.map(async (sym) => {
      const url = `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${sym}`;
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`Binance error for ${sym}: ${r.status}`);
      const j = await r.json();
      results[sym] = j.price;
    }));

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(results);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
