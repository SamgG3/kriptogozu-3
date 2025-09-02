// pages/api/signals.js
export default function handler(req, res) {
  // Şimdilik örnek veri – sayfayı doğrulamak için
  const now = Date.now();
  const signals = [
    {
      id: `BTCUSDT-${now - 120000}-LONG`,
      symbol: "BTCUSDT",
      price: 62450.3,
      side: "LONG",
      entry: 62380.0,
      sl: 61940.0,
      tp: 63000.0,
      status: "new",
      createdAt: now - 120000,
      updatedAt: now - 120000,
    },
    {
      id: `SOLUSDT-${now - 240000}-SHORT`,
      symbol: "SOLUSDT",
      price: 142.85,
      side: "SHORT",
      entry: 142.1,
      sl: 144.0,
      tp: 139.8,
      status: "new",
      createdAt: now - 240000,
      updatedAt: now - 240000,
    },
  ];
  res.status(200).json({ signals });
}
