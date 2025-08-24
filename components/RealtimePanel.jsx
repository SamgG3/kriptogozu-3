import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * KriptoGözü – Realtime WebSocket Layer (Next.js Pages Router + React)
 * - Binance Futures miniTicker stream ile canlı fiyat
 * - Veri doğrulama (NaN / open<=0 atlanır)
 * - Stale-data uyarısı (gecikirse kırmızı rozet)
 * - Otomatik yeniden bağlanma (exponential backoff + jitter)
 * - Periyodik Long/Short oranı (REST: globalLongShortAccountRatio)
 */

const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"];
const WS_BASE = "wss://fstream.binance.com/stream";   // combined stream
const REST_BASE = "https://fapi.binance.com";         // futures REST

function buildCombinedStreamUrl(symbols) {
  const streams = symbols.map((s) => `${s.toLowerCase()}@miniTicker`).join("/");
  return `${WS_BASE}?streams=${streams}`;
}

function classifyRisk(high, low, open) {
  if (!isFinite(open) || open <= 0) return "LOW";
  const rangePct = Math.abs(high - low) / open; // 24s aralık
  if (rangePct >= 0.07) return "HIGH";
  if (rangePct >= 0.03) return "MEDIUM";
  return "LOW";
}

function formatPct(n) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function useLocalStorage(key) {
  const [bump, setBump] = useState(0);
  const get = useCallback(() => {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
  }, [key]);
  const set = useCallback((val) => {
    localStorage.setItem(key, JSON.stringify(val));
    setBump((x) => x + 1);
  }, [key]);
  return { get, set, bump };
}

export default function RealtimePanel({
  symbols = DEFAULT_SYMBOLS,
  staleAfterMs = 5000,
  longShortFetchEveryMs = 30000,
  onOpenDetails,
}) {
  const [tickers, setTickers] = useState({});
  const [status, setStatus] = useState("CONNECTING"); // CONNECTING | OPEN | CLOSED | ERROR
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const lastMessageTsRef = useRef(0);
  const reconnectAttemptRef = useRef(0);
  const mountedRef = useRef(true);

  // Favoriler
  const { get: getFavs, set: setFavs, bump: favsBump } = useLocalStorage("kg-favorites");
  const favorites = useMemo(() => getFavs(), [getFavs, favsBump]);

  const combinedUrl = useMemo(() => buildCombinedStreamUrl(symbols), [symbols]);

  // WebSocket bağlan
  const connect = useCallback(() => {
    try {
      setStatus("CONNECTING");
      setError(null);
      const ws = new WebSocket(combinedUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setStatus("OPEN");
        reconnectAttemptRef.current = 0;
      };

      ws.onmessage = (ev) => {
        lastMessageTsRef.current = Date.now();
        try {
          const packet = JSON.parse(ev.data);
          const d = packet?.data;
          if (!d || typeof d.s !== "string") return;

          const symbol = d.s.toUpperCase();
          const price = Number(d.c);
          const open = Number(d.o);
          const high = Number(d.h);
          const low = Number(d.l);
          const volume = Number(d.v);
          const quoteVolume = Number(d.q);

          if (!isFinite(price) || !isFinite(open) || open <= 0) return;

          const changePct = ((price - open) / open) * 100;
          const riskTier = classifyRisk(high, low, open);

          setTickers((prev) => ({
            ...prev,
            [symbol]: {
              symbol,
              price,
              open,
              high,
              low,
              volume,
              quoteVolume,
              changePct,
              lastUpdate: Date.now(),
              riskTier,
              longShortRatio: prev[symbol]?.longShortRatio,
            },
          }));
        } catch {
          // JSON hatasını sessiz geç
        }
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        setStatus("ERROR");
        setError("WebSocket hatası");
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setStatus("CLOSED");
        const attempt = (reconnectAttemptRef.current = reconnectAttemptRef.current + 1);
        const base = Math.min(30000, 1000 * Math.pow(2, attempt)); // max 30sn
        const jitter = Math.floor(Math.random() * 1000);
        setTimeout(() => mountedRef.current && connect(), base + jitter);
      };
    } catch (e) {
      setStatus("ERROR");
      setError(e?.message || "Bilinmeyen hata");
    }
  }, [combinedUrl]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      try { wsRef.current?.close(); } catch {}
    };
  }, [connect]);

  // Heartbeat: uzun süre mesaj gelmezse kapatıp yeniden bağlan
  useEffect(() => {
    const iv = setInterval(() => {
      if (status === "OPEN" && Date.now() - lastMessageTsRef.current > Math.max(staleAfterMs * 2, 10000)) {
        try { wsRef.current?.close(); } catch {}
      }
    }, 2000);
    return () => clearInterval(iv);
  }, [status, staleAfterMs]);

  // Long/Short oranlarını REST ile periyodik çek
  useEffect(() => {
    let abort = false;

    async function fetchLS(symbol) {
      try {
        const url = `${REST_BASE}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`;
        const res = await fetch(url);
        if (!res.ok) return;
        const arr = await res.json();
        const last = arr?.[0];
        const ratio = last ? Number(last.longShortRatio) : NaN;
        if (!isFinite(ratio) || abort) return;
        setTickers((prev) => ({
          ...prev,
          [symbol]: {
            ...prev[symbol],
            longShortRatio: ratio,
          },
        }));
      } catch {
        // sessiz geç
      }
    }

    // ilk tetikleme + periyodik
    symbols.forEach((s, idx) => setTimeout(() => fetchLS(s.toUpperCase()), idx * 350));
    const iv = setInterval(() => {
      symbols.forEach((s, idx) => setTimeout(() => fetchLS(s.toUpperCase()), idx * 350));
    }, longShortFetchEveryMs);

    return () => {
      abort = true;
      clearInterval(iv);
    };
  }, [symbols, longShortFetchEveryMs]);

  const favSet = useMemo(() => new Set((favorites || []).map((x) => x.toUpperCase())), [favorites]);

  const rows = useMemo(() => {
    const list = Object.values(tickers);
    return list.sort((a, b) => {
      const aFav = favSet.has(a.symbol) ? 1 : 0;
      const bFav = favSet.has(b.symbol) ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;
      return Math.abs(b.changePct) - Math.abs(a.changePct);
    });
  }, [tickers, favSet]);

  const toggleFavorite = (symbol) => {
    const st = new Set((getFavs() || []).map((x) => x.toUpperCase()));
    const up = symbol.toUpperCase();
    if (st.has(up)) st.delete(up); else st.add(up);
    setFavs(Array.from(st));
  };

  const isStale = (t) => Date.now() - t.lastUpdate > staleAfterMs;

  return (
    <div className="w-full max-w-6xl mx-auto p-4">
      <Header status={status} error={error} />

      <div className="mt-4 overflow-hidden rounded-2xl shadow border border-zinc-800" style={{background:"#0b0b0f"}}>
        <div className="grid grid-cols-12 text-xs sm:text-sm md:text-base px-4 py-3 font-medium text-zinc-300" style={{background:"#14141a"}}>
          <div className="col-span-3">Sembol</div>
          <div className="col-span-2 text-right">Fiyat</div>
          <div className="col-span-2 text-right">24s Değişim</div>
          <div className="col-span-2 text-center">Risk</div>
          <div className="col-span-2 text-center">Long/Short</div>
          <div className="col-span-1 text-center">⭐</div>
        </div>

        <div className="divide-y divide-zinc-900/50">
          {rows.map((t) => (
            <button
              key={t.symbol}
              onClick={() => onOpenDetails && onOpenDetails(t.symbol)}
              className="grid grid-cols-12 w-full items-center px-4 py-3 hover:bg-zinc-900/50 transition text-left"
              style={{color:"#e5e7eb"}}
            >
              <div className="col-span-3 flex items-center gap-2">
                <span className="font-semibold">{t.symbol}</span>
                {isStale(t) && <StaleBadge />}
              </div>

              <div className="col-span-2 text-right tabular-nums">{t.price.toLocaleString(undefined, { maximumFractionDigits: 6 })}</div>

              <div className="col-span-2 text-right">
                <span className={t.changePct > 0 ? "text-emerald-400" : t.changePct < 0 ? "text-red-400" : "text-zinc-300"}>
                  {formatPct(t.changePct)}
                </span>
              </div>

              <div className="col-span-2 text-center">
                <RiskPill tier={t.riskTier} />
              </div>

              <div className="col-span-2 text-center">
                {typeof t.longShortRatio === "number" ? (
                  <span className={t.longShortRatio >= 1 ? "text-emerald-400" : "text-red-400"}>{t.longShortRatio.toFixed(2)}x</span>
                ) : (
                  <span className="text-zinc-500">—</span>
                )}
              </div>

              <div className="col-span-1 flex justify-center">
                <FavStar
                  active={Array.isArray(favorites) && favorites.map((x)=>x.toUpperCase()).includes(t.symbol)}
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(t.symbol); }}
                />
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 text-xs text-zinc-500">
        <ul className="list-disc pl-5 space-y-1">
          <li>Veri doğrulama: NaN/boş değerler yoksayılır, open ≤ 0 ise güncellenmez.</li>
          <li>Stale uyarı: {Math.round(staleAfterMs/1000)} sn içinde güncellenmeyen satırlara kırmızı işaret eklenir.</li>
          <li>Oto-yeniden bağlanma: Exponential backoff + jitter (maks 30sn).</li>
          <li>Long/Short oranı: 5 dakikalık global hesap oranı REST ile periyodik çekilir.</li>
        </ul>
      </div>
    </div>
  );
}

function Header({ status, error }) {
  const color =
    status === "OPEN" ? "text-emerald-400" :
    status === "CONNECTING" ? "text-amber-400" :
    status === "ERROR" ? "text-red-400" : "text-zinc-300";
  const label =
    status === "OPEN" ? "Canlı" :
    status === "CONNECTING" ? "Bağlanıyor" :
    status === "ERROR" ? "Hata" : "Kapalı";

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`inline-block w-2 h-2 rounded-full ${
          status === "OPEN" ? "bg-emerald-400" :
          status === "CONNECTING" ? "bg-amber-400" :
          status === "ERROR" ? "bg-red-400" : "bg-zinc-500"
        }`} />
        <span className={`text-sm ${color}`}>WebSocket: {label}</span>
        {error && <span className="text-sm text-red-400">• {error}</span>}
      </div>
      <div className="text-xs text-zinc-500">Kaynak: Binance Futures (miniTicker)</div>
    </div>
  );
}

function RiskPill({ tier }) {
  const map = {
    LOW: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    MEDIUM: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    HIGH: "bg-red-500/10 text-red-400 border-red-500/30",
  };
  const label = tier === "LOW" ? "Düşük" : tier === "MEDIUM" ? "Orta" : "Yüksek";
  return <span className={`px-2 py-1 rounded-full border text-xs ${map[tier]}`}>{label}</span>;
}

function StaleBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-red-400 text-[10px]">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
      Eski veri
    </span>
  );
}

function FavStar({ active, onClick }) {
  return (
    <span
      onClick={onClick}
      className={`inline-block w-5 h-5 cursor-pointer select-none ${active ? "text-yellow-400" : "text-zinc-500"}`}
      title={active ? "Favorilerden çıkar" : "Favorilere ekle"}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 .587l3.668 7.431 8.2 1.192-5.934 5.787 1.401 8.166L12 18.896l-7.335 3.867 1.401-8.166L.132 9.21l8.2-1.192L12 .587z" />
      </svg>
    </span>
  );
}
