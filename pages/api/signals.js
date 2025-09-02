// pages/api/signals.js
// 15m kırılım sinyalleri için örnek API.
// TP1/TP2/TP3, R = |Entry - SL| ile otomatik hesaplanır (1.0R / 1.5R / 2.0R).

export default function handler(req, res) {
  const now = Date.now();

  // Yardımcılar
  const withTPs = (s) => {
    const side = String(s.side || "").toUpperCase();
    const R = Math.abs(Number(s.entry) - Number(s.sl));
    const tp1 = side === "LONG" ? s.entry + 1.0 * R : s.entry - 1.0 * R;
    const tp2 = side === "LONG" ? s.entry + 1.5 * R : s.entry - 1.5 * R;
    const tp3 = side === "LONG" ? s.entry + 2.0 * R : s.entry - 2.0 * R;
    return { ...s, tp1, tp2, tp3 };
  };

  const mk = (symbol, side, price, entry, sl, minsAgo) => ({
    id: `${symbol}-${now - minsAgo * 60000}-${side}`,
    symbol,
    price,
    side,            // "LONG" | "SHORT"
    entry,
    sl,
    status: "new",   // "new"/"active" → görünür; "tp"/"sl"/"cancelled" → gizlenir
    createdAt: now - minsAgo * 60000,
    updatedAt: now - minsAgo * 60000,
  });

  // Şimdilik örnekler — gerçek motorda bunlar kırılım kurallarından gelecek
  const raw = [
    mk("BTCUSDT","LONG", 62450.3, 62380.0, 61940.0, 2),
    mk("SOLUSDT","SHORT",142.85, 142.10, 144.00, 4),
    mk("ETHUSDT","LONG", 4320.7, 4310.0, 4275.0, 5),
    mk("BNBUSDT","SHORT",852.1, 850.5, 864.0, 6),
    mk("AVAXUSDT","LONG", 28.35, 28.10, 27.40, 7),
    mk("XRPUSDT","SHORT",0.5621, 0.5590, 0.5710, 8),
    mk("ADAUSDT","LONG", 0.4823, 0.4800, 0.4680, 9),
    mk("DOGEUSDT","SHORT",0.1215, 0.1210, 0.1255, 10),
  ];

  const signals = raw.map(withTPs);

  res.status(200).json({ signals });
}
