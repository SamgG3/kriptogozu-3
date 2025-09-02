// pages/api/signals.js
// Basit örnek API: 8 sinyal + TP1/TP2/TP3
export default function handler(req, res) {
  const now = Date.now();
  const mk = (symbol, side, price, entry, sl, t1, t2, t3, minsAgo) => ({
    id: `${symbol}-${now - minsAgo * 60000}-${side}`,
    symbol,
    price,
    side,            // "LONG" | "SHORT"
    entry,
    sl,
    tp1: t1,
    tp2: t2,
    tp3: t3,
    status: "new",   // "new" | "active" -> görünür; "tp"/"sl"/"cancelled" gizlenir
    createdAt: now - minsAgo * 60000,
    updatedAt: now - minsAgo * 60000,
  });

  const s = [
    mk("BTCUSDT","LONG", 62450.3, 62380.0, 61940.0, 62600.0, 62850.0, 63000.0, 2),
    mk("SOLUSDT","SHORT",142.85, 142.10, 144.00, 141.20, 140.30, 139.80, 4),
    mk("ETHUSDT","LONG", 4320.7, 4310.0, 4275.0, 4340.0, 4360.0, 4380.0, 5),
    mk("BNBUSDT","SHORT",852.1, 850.5, 864.0, 842.0, 836.0, 830.0, 6),
    mk("AVAXUSDT","LONG", 28.35, 28.10, 27.40, 28.70, 29.10, 29.50, 7),
    mk("XRPUSDT","SHORT",0.5621, 0.5590, 0.5710, 0.5520, 0.5460, 0.5400, 8),
    mk("ADAUSDT","LONG", 0.4823, 0.4800, 0.4680, 0.4900, 0.4950, 0.5000, 9),
    mk("DOGEUSDT","SHORT",0.1215, 0.1210, 0.1255, 0.1195, 0.1175, 0.1160, 10),
  ];

  res.status(200).json({ signals: s });
}
