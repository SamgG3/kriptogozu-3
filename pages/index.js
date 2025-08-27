// pages/index.js
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

/* ==================== Ayarlar ==================== */
const DEFAULTS = ["BTCUSDT", "ETHUSDT", "BNBUSDT"];
const INTERVALS = ["1m","3m","5m","15m","30m","1h","2h","3h","4h","12h","1d","3d"];

/* ==================== Yardımcılar ==================== */
const fmt = (v, d = 2) =>
  v == null || isNaN(v)
    ? "—"
    : Number(v).toLocaleString("tr-TR", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      });

const fmtPrice = (v) => {
  if (v == null || isNaN(v)) return "—";
  const a = Math.abs(v);
  const d = a >= 100 ? 2 : a >= 1 ? 4 : 6;
  return Number(v).toLocaleString("tr-TR", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
};

const clamp = (x, min, max) => Math.max(min, Math.min(max, x));

/* Basit bias skoru (EMA, RSI, Stoch, Bollinger) */
function biasFromLatest(L) {
  if (!L) return { longPct: 50, shortPct: 50, score: 0 };
  const close = L.close, ema = L.ema20, rsi = L.rsi14, k = L.stochK, d = L.stochD, bu = L.bbUpper, bl = L.bbLower;

  const emaDist = close != null && ema != null ? ((close - ema) / ema) * 100 : null;
  const kCross = k != null && d != null ? k - d : null;
  const bandPos = bu != null && bl != null && close != null ? ((close - bl) / (bu - bl)) * 100 : null;

  const nEMA  = emaDist == null ? 0 : clamp(emaDist / 3, -1, 1);
  const nRSI  = rsi     == null ? 0 : clamp((rsi - 50) / 25, -1, 1);
  const nKxD  = kCross  == null ? 0 : clamp(kCross / 50, -1, 1);
  const nBand = bandPos == null ? 0 : clamp((bandPos - 50) / 30, -1, 1);

  const score = 0.35*nEMA + 0.30*nRSI + 0.20*nKxD + 0.15*nBand;
  const longPct = Math.round(((score + 1) / 2) * 100);
  const shortPct = 100 - longPct;
  return { longPct, shortPct, score };
}

/* Risk etiketi: ATR varsa onu, yoksa BB genişliği fallback */
function riskLabel(L) {
  const c = L?.close;
  const atr = L?.atr14;
  if (c && atr) {
    const p = atr / c;
    if (p < 0.008) return { txt: "Düşük", color: "#2ecc71" };
    if (p < 0.02)  return { txt: "Orta",  color: "#f1c40f" };
    return { txt: "Yüksek", color: "#e74c3c" };
  }
  const bu = L?.bbUpper, bl = L?.bbLower;
  if (c && bu && bl) {
    const w = (bu - bl) / c; // BB genişliği oranı
    if (w < 0.01)  return { txt: "Düşük", color: "#2ecc71" };
    if (w < 0.03)  return { txt: "Orta",  color: "#f1c40f" };
    return { txt: "Yüksek", color: "#e74c3c" };
  }
  return { txt: "—", color: "#9aa4b2" };
}

/* ==================== Sayfa ==================== */
export default function Home() {
  const router = useRouter();

  const [q, setQ] = useState("");
  const [interval, setIntervalStr] = useState("1m");

  const [symbols, setSymbols] = useState(DEFAULTS);
  const [rows, setRows] = useState({});      // indikatör verileri
  const [loading, setLoading] = useState(false);

  const [wsTicks, setWsTicks] = useState({}); // canlı fiyat + 24s değişim
  const [auto, setAuto] = useState(true);
  const timer = useRef(null);

  /* Giriş bilgisi (localStorage) */
  const [user, setUser] = useState(null);
  useEffect(() => {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem("kgz_user");
      if (raw) try { setUser(JSON.parse(raw)); } catch {}
    }
  }, []);
  const logout = () => {
    try { localStorage.removeItem("kgz_user"); } catch {}
    setUser(null);
  };

  /* ========== Arama ========= */
  const onSearch = () => {
    const t = q.trim().toUpperCase();
    if (!t) return;
    const sym = t.endsWith("USDT") ? t : t + "USDT";
    router.push(`/coin/${sym}`);
  };
  const onReset = () => setQ("");

  /* ========== İndikatör datası yükle ========= */
  async function load() {
    try {
      setLoading(true);
      const res = await Promise.all(
        symbols.map((sym) =>
          fetch(`/api/futures/indicators?symbol=${sym}&interval=${interval}&limit=300`, { cache: "no-store" })
            .then((r) => r.json())
            .catch(() => null)
        )
      );
      const map = {};
      symbols.forEach((sym, i) => (map[sym] = res[i]));
      setRows(map);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [interval, symbols]);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (auto) timer.current = setInterval(load, 10_000);
    return () => clearInterval(timer.current);
  }, [auto, interval, symbols]);

  /* ========== WebSocket (miniTicker) ========= */
  useEffect(() => {
    if (!symbols?.length) return;
    const streams = symbols.map((s) => `${s.toLowerCase()}@miniTicker`).join("/");
    const url = `wss://fstream.binance.com/stream?streams=${streams}`;
    let ws;
    try {
      ws = new WebSocket(url);
      ws.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data)?.data;
          if (d?.s) {
            const last = d?.c ? +d.c : null;
            const chg = d?.P !== undefined
              ? +d.P
              : (d?.o && d?.c) ? ((+d.c - +d.o) / +d.o) * 100 : null; // fallback: (close-open)/open
            setWsTicks((prev) => ({ ...prev, [d.s]: { last, chg } }));
          }
        } catch {}
      };
    } catch {}
    return () => { try { ws && ws.close(); } catch {} };
  }, [symbols]);

  /* ========== UI ========= */
  return (
    <div style={{ paddingBottom: 44 /* alttaki fixed bant için boşluk */ }}>
      <main style={{ padding: "16px 18px" }}>
        {/* NAV */}
        <nav style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <Link href="/" style={{ color: "#8bd4ff", fontWeight: 800 }}>Ana Sayfa</Link>
          <Link href="/panel" style={{ color: "#d0d6e6" }}>Panel</Link>
          <Link href="/whales" style={{ color: "#d0d6e6" }}>Balina</Link>
          <Link href="/balina2d" style={{ color: "#d0d6e6" }}>Balina2D</Link>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ opacity: .7 }}>TR / EN</span>
            {user ? (
              <>
                <span style={{ background:"#1f2a44", padding:"6px 10px", borderRadius: 8, fontWeight:700 }}>
                  {user.name || "Kullanıcı"}
                </span>
                <button onClick={logout}
                  style={{ padding:"6px 10px", background:"#1a1f2e", border:"1px solid #2a2f45", borderRadius:8, color:"#fff" }}>
                  Çıkış
                </button>
              </>
            ) : (
              <Link href="/login" style={{ color:"#fff", background:"#1a1f2e", border:"1px solid #2a2f45", padding:"6px 10px", borderRadius:8 }}>
                Giriş
              </Link>
            )}
          </div>
        </nav>

        {/* Üst bar */}
        <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:12, flexWrap:"wrap" }}>
          <h1 style={{ margin:0, fontSize:20 }}>Kripto Gözü • Genel Panel</h1>
          <span style={{ opacity:.7 }}>(kartlarda AI özet • detay için tıkla)</span>

          <select value={interval} onChange={(e)=>setIntervalStr(e.target.value)}
            style={{ padding:"8px 10px", background:"#121625", border:"1px solid #23283b", borderRadius:10, color:"#e6e6e6", marginLeft:10 }}>
            {INTERVALS.map((x)=> <option key={x} value={x}>{x}</option>)}
          </select>

          <button onClick={load} disabled={loading}
            style={{ padding:"8px 12px", background:"#1a1f2e", border:"1px solid #2a2f45", borderRadius:10, color:"#fff", fontWeight:700 }}>
            {loading ? "Yükleniyor…" : "Yenile"}
          </button>

          <label style={{ marginLeft:8, display:"flex", alignItems:"center", gap:8 }}>
            <input type="checkbox" checked={auto} onChange={(e)=>setAuto(e.target.checked)} />
            10 sn’de bir otomatik yenile
          </label>

          {/* Arama */}
          <div style={{ display:"flex", gap:8, alignItems:"center", marginLeft:"auto" }}>
            <input
              value={q}
              onChange={(e)=>setQ(e.target.value)}
              placeholder="BTC, ETH, SOL…"
              style={{ padding:"8px 10px", background:"#121625", border:"1px solid #23283b", borderRadius:10, color:"#fff", minWidth:180 }}
            />
            <button onClick={onSearch}
              style={{ padding:"8px 10px", background:"#1a1f2e", border:"1px solid #2a2f45", borderRadius:10, color:"#fff", fontWeight:700 }}>
              Ara
            </button>
            <button onClick={onReset}
              style={{ padding:"8px 10px", background:"#1a1f2e", border:"1px solid #2a2f45", borderRadius:10, color:"#fff", fontWeight:700 }}>
              Sıfırla
            </button>
          </div>
        </div>

        {/* Sembol listesi */}
        <div style={{ border:"1px solid #23283b", borderRadius:10, overflow:"hidden", marginBottom:14, background:"#121625" }}>
          <div style={{
            display:"grid", gridTemplateColumns:"1.2fr 1fr 1fr 1fr 0.8fr",
            gap:0, padding:"10px 12px", background:"#0e1424", color:"#a9b4c9", fontWeight:700
          }}>
            <div>• WebSocket: Canlı</div>
            <div>Fiyat</div>
            <div>Long/Short</div>
            <div>24s Değişim</div>
            <div>Risk</div>
          </div>

          {symbols.map((sym) => {
            const w = wsTicks[sym] || {};
            const latest = rows[sym]?.latest || null;
            const { longPct, shortPct } = biasFromLatest(latest);
            const risk = riskLabel(latest);
            const chgTxt = w.chg == null ? "—" : (w.chg >= 0 ? "+" : "") + fmt(w.chg, 2) + "%";
            const chgColor = w.chg == null ? "#d0d6e6" : w.chg >= 0 ? "#22d39a" : "#ff6b6b";

            return (
              <div key={sym} style={{
                display:"grid", gridTemplateColumns:"1.2fr 1fr 1fr 1fr 0.8fr",
                gap:0, padding:"12px", borderTop:"1px solid #23283b", alignItems:"center"
              }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <Link href={`/coin/${sym}`} style={{ color:"#8bd4ff", fontWeight:800 }}>{sym}</Link>
                </div>

                <div style={{ fontWeight:700 }}>{fmtPrice(w.last ?? latest?.close)}</div>

                <div style={{ fontWeight:700 }}>
                  <span style={{ color:"#22d39a" }}>Long {fmt(longPct,0)}%</span>
                  <span style={{ opacity:.6 }}> / </span>
                  <span style={{ color:"#ff6b6b" }}>Short {fmt(shortPct,0)}%</span>
                </div>

                <div style={{ color: chgColor, fontWeight: 800 }}>{chgTxt}</div>

                <div>
                  <span style={{
                    padding:"4px 8px", borderRadius:20, border:"1px solid #2a2f45",
                    background:"#151a2b", color:risk.color, fontWeight:800
                  }}>
                    {risk.txt}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Hızlı Özet Kartları */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))", gap:12 }}>
          {symbols.map((sym) => (
            <CoinCard key={sym} sym={sym} row={rows[sym]} ws={wsTicks[sym]} />
          ))}
        </div>

        <div style={{ opacity:.6, marginTop:10, fontSize:12 }}>
          Bu sayfadaki veriler otomatik olarak 10 sn’de bir yenilenir; yatırım tavsiyesi değildir.
        </div>
      </main>

      {/* ALT BANT – fixed en altta */}
      <div style={{
        position:"fixed", left:0, right:0, bottom:0, zIndex:50,
        borderTop:"1px solid #23283b", background:"#0e1424"
      }}>
        <div className="kgz-marq" style={{ whiteSpace:"nowrap", padding:"8px 0" }}>
          <span style={{ paddingLeft:24, color:"#d0d6e6", fontWeight:700 }}>
            — Tanrının Gözü — Kriptonun Gözü — Bu kanalda paylaşılanlar SPK kuralları gereğince
            KESİNLİKLE yatırım tavsiyesi niteliğinde değildir. — Tanrının Gözü — Kriptonun Gözü —
          </span>
        </div>
        <style jsx>{`
          @keyframes kgzScroll { 0%{transform:translateX(100%);} 100%{transform:translateX(-100%);} }
          .kgz-marq { animation: kgzScroll 30s linear infinite; }
        `}</style>
      </div>
    </div>
  );
}

/* ==================== Kart ==================== */
function CoinCard({ sym, row, ws }) {
  const L = row?.latest || {};
  const close = ws?.last ?? L?.close;
  const { longPct, shortPct } = biasFromLatest(L);
  const signal = longPct >= 55 ? "AL" : shortPct >= 55 ? "SAT" : "NÖTR";
  const color  = signal === "AL" ? "#20c997" : signal === "SAT" ? "#ff6b6b" : "#89a";
  const border = signal === "AL" ? "#1f7a4f"  : signal === "SAT" ? "#7a2e2e" : "#2a2f45";

  return (
    <Link href={`/coin/${sym}`} style={{ textDecoration:"none" }}>
      <div style={{
        background:"#151a2b", border:`1px solid ${border}`, borderRadius:12,
        padding:14, display:"grid", gridTemplateColumns:"1fr auto", alignItems:"center", gap:10, minHeight:90
      }}>
        <div style={{ display:"grid", gap:4 }}>
          <div style={{ fontWeight:800, fontSize:18, color:"#8bd4ff" }}>{sym}</div>
          <div style={{ opacity:.85 }}>Son Fiyat: <b>{fmtPrice(close)}</b></div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontWeight:800, color }}>{signal}</div>
          <div style={{ opacity:.9, marginTop:4 }}>
            <span style={{ color:"#20c997", fontWeight:700 }}>Long {fmt(longPct,0)}%</span>
            <span style={{ opacity:.7 }}> / </span>
            <span style={{ color:"#ff6b6b", fontWeight:700 }}>Short {fmt(shortPct,0)}%</span>
          </div>
          <div style={{ opacity:.6, fontSize:12, marginTop:6 }}>Tıkla → detay</div>
        </div>
      </div>
    </Link>
  );
}
