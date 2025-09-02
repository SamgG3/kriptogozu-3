// pages/sinyal.js
// KriptoGözü — "Sinyal" sekmesi (yalın tasarım)
// İki sütun: SOL = SHORT, SAĞ = LONG. Kartta sadece: COIN/USDT + Fiyat + Yön (LONG/SHORT) + Entry/SL/TP.
// Otomatik yenileme ~3sn. Filtre/sıralama/rozet yok. Geliş sırası: yeni en üstte.
// -------------------------------------------------------------
// JSON Şeması (örnek) — Backend /api/signals için beklenen payload
// {
//   "signals": [
//     {
//       "id": "BTCUSDT-1735939200-LONG",   // benzersiz anahtar (symbol|ts|side)
//       "symbol": "BTCUSDT",                 // Binance Futures sembolü
//       "price": 62450.30,                    // anlık fiyat (Binance Futures)
//       "side": "LONG",                      // "LONG" | "SHORT"
//       "entry": 62380.0,                     // tek giriş seviyesi (retest ya da close)
//       "sl": 61940.0,                        // tek stop seviyesi
//       "tp": 63000.0,                        // ana hedef (TP)
//       "status": "new",                     // "new" | "active" | "tp" | "sl" | "cancelled"
//       "createdAt": 1725345600000,           // ms (geliş sırası için)
//       "updatedAt": 1725345660000            // ms
//     }
//   ]
// }
// Not: Kapalı sinyaller (status: "tp" | "sl" | "cancelled") UI'da gösterilmez.
// -------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";

const REFRESH_MS = 3000; // ~3 sn

// Yardımcılar
const fmt = (v, d = 2) =>
  v == null || isNaN(v) ? "—" : Number(v).toLocaleString("tr-TR", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });

// Mock verisi ("NEXT_PUBLIC_USE_MOCK=1" ise kullanılır)
const MOCK_SIGNALS = [
  {
    id: "BTCUSDT-1725345600000-LONG",
    symbol: "BTCUSDT",
    price: 62450.3,
    side: "LONG",
    entry: 62380.0,
    sl: 61940.0,
    tp: 63000.0,
    status: "new",
    createdAt: Date.now() - 1000 * 60 * 2, // 2 dk önce
    updatedAt: Date.now() - 1000 * 60 * 2,
  },
  {
    id: "SOLUSDT-1725345605000-SHORT",
    symbol: "SOLUSDT",
    price: 142.85,
    side: "SHORT",
    entry: 142.1,
    sl: 144.0,
    tp: 139.8,
    status: "new",
    createdAt: Date.now() - 1000 * 60 * 4, // 4 dk önce
    updatedAt: Date.now() - 1000 * 60 * 4,
  },
];

async function fetchSignals() {
  if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCK === "1") {
    // Mock: her çağrıda hafifçe fiyatı oynat
    return {
      signals: MOCK_SIGNALS.map((s) => ({
        ...s,
        price:
          s.price + (Math.random() - 0.5) * (s.price > 1000 ? 10 : 0.1),
        updatedAt: Date.now(),
      })),
    };
  }
  try {
    const res = await fetch("/api/signals", { cache: "no-store" });
    if (!res.ok) throw new Error("/api/signals yanıtı başarısız");
    const data = await res.json();
    if (!data || !Array.isArray(data.signals)) throw new Error("Geçersiz payload");
    return data;
  } catch (e) {
    // Sessiz hata: UI'da uyarı göstermiyoruz, önceki veriyi koruyacağız
    return { signals: [] };
  }
}

export default function SinyalPage() {
  const [signals, setSignals] = useState([]);
  const timerRef = useRef(null);

  // İlk yükleme + periyodik yenileme
  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      const data = await fetchSignals();
      if (!isMounted) return;
      setSignals((prev) => mergeById(prev, data.signals));
    };
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => {
      isMounted = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Kapalı sinyalleri ayıkla ve geliş sırasına göre (yeni en üstte) sırala
  const activeSorted = useMemo(() => {
    const open = signals.filter(
      (s) => !["tp", "sl", "cancelled"].includes(String(s.status || "").toLowerCase())
    );
    return open.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [signals]);

  const leftShort = activeSorted.filter((s) => s.side === "SHORT");
  const rightLong = activeSorted.filter((s) => s.side === "LONG");

  return (
    <main className="min-h-screen w-full bg-[#0b0e17] text-[#e6e6e6] p-4 md:p-6">
      {/* İki sütun grid: sol SHORT, sağ LONG; başlık yok → minimalist */}
      <div className="mx-auto max-w-7xl grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {/* SHORT sütunu */}
        <section className="space-y-4">
          {leftShort.length === 0 ? (
            <EmptyPlaceholder />
          ) : (
            leftShort.map((s) => <SignalCard key={s.id} s={s} />)
          )}
        </section>
        {/* LONG sütunu */}
        <section className="space-y-4">
          {rightLong.length === 0 ? (
            <EmptyPlaceholder />
          ) : (
            rightLong.map((s) => <SignalCard key={s.id} s={s} />)
          )}
        </section>
      </div>
    </main>
  );
}

function EmptyPlaceholder() {
  // Hiçbir şey yazmayalım dersen boş bir blok da bırakabiliriz; şimdilik ince gri çizgi.
  return <div className="h-10 border border-[#1a2033] rounded-2xl" />;
}

function SignalCard({ s }) {
  const side = (s.side || "").toUpperCase();
  const isLong = side === "LONG";
  return (
    <div
      className="rounded-2xl border border-[#1a2033] bg-[#0f1320] shadow-sm p-4 md:p-5 hover:shadow-md transition"
      role="article"
      aria-label={`${s.symbol} ${side}`}
    >
      {/* Üst satır: Sembol | Fiyat | Yön etiketi */}
      <div className="flex items-center justify-between">
        <div className="text-base md:text-lg font-medium tracking-wide">
          {fmtSymbol(s.symbol)}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm md:text-base tabular-nums opacity-90">
            {fmt(s.price, s.price > 1000 ? 1 : 4)}
          </div>
          <span
            className={
              "px-3 py-1 rounded-full text-xs md:text-sm font-semibold select-none " +
              (isLong ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300")
            }
          >
            {side}
          </span>
        </div>
      </div>

      {/* Ayırıcı */}
      <div className="my-3 h-px bg-[#1a2033]" />

      {/* Alt satırlar: Entry / SL / TP — yalın metin */}
      <div className="grid grid-cols-3 gap-3">
        <KV k="Entry" v={fmt(s.entry, s.entry > 1000 ? 1 : 4)} />
        <KV k="SL" v={fmt(s.sl, s.sl > 1000 ? 1 : 4)} />
        <KV k="TP" v={fmt(s.tp, s.tp > 1000 ? 1 : 4)} />
      </div>
    </div>
  );
}

function KV({ k, v }) {
  return (
    <div className="rounded-xl bg-[#0b0e17] border border-[#131a2a] p-3 text-center">
      <div className="text-[10px] uppercase tracking-wider opacity-60">{k}</div>
      <div className="mt-0.5 text-sm md:text-base tabular-nums">{v}</div>
    </div>
  );
}

function fmtSymbol(sym = "") {
  // "BTCUSDT" → "BTC/USDT"
  const s = sym.toUpperCase();
  if (s.endsWith("USDT")) return s.replace("USDT", "/USDT");
  if (s.endsWith("USD")) return s.replace("USD", "/USD");
  return s;
}

function mergeById(prev, next) {
  // Gelen veriyi (next) önce closed/iptal edilenleri hariç tutup mevcutlara göre günceller.
  const map = new Map(prev.map((x) => [x.id, x]));
  for (const n of next) {
    if (["tp", "sl", "cancelled"].includes(String(n.status || "").toLowerCase())) {
      // Kapalı sinyali listeden çıkar
      map.delete(n.id);
      continue;
    }
    const old = map.get(n.id);
    map.set(n.id, { ...(old || {}), ...n });
  }
  // Geliş sırasına göre (createdAt desc)
  return Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

// -------------------------------------------------------------
// Basit API örneği (opsiyonel): pages/api/signals.js
// Not: Sadece referans; gerçek üretimde Binance Futures verinize bağlanın.
// -------------------------------------------------------------
// export default function handler(req, res) {
//   res.status(200).json({ signals: MOCK_SIGNALS });
// }
