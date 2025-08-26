// pages/_app.js
import { useEffect, useMemo, useRef, useState } from "react";

// globals.css varsa yüklensin; yoksa sorun çıkarma
try { require("../styles/globals.css"); } catch {}

function Marquee({ text, position = "top" }) {
  const borderTop = position === "bottom" ? "1px solid #1f2742" : "none";
  const borderBottom = position === "top" ? "1px solid #1f2742" : "none";
  return (
    <div style={{ width:"100%", background:"#0f1424", borderTop, borderBottom, overflow:"hidden" }}>
      <div style={{
        whiteSpace:"nowrap", display:"inline-block", padding:"8px 0",
        animation:"scrollx 22s linear infinite", fontWeight:800, color:"#9bd0ff"
      }}>
        {text}&nbsp;&nbsp;{text}&nbsp;&nbsp;{text}&nbsp;&nbsp;{text}
      </div>
      <style jsx global>{`
        @keyframes scrollx { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        html, body, #__next { height: 100%; }
        body { margin:0; background:#0b1020; color:#e6edf6; }
        a { color:#9bd0ff; }
        .btn { padding:8px 10px; background:#11182e; border:1px solid #223054; border-radius:10px; color:#e6edf6; cursor:pointer; }
      `}</style>
    </div>
  );
}

/* ====== Küçük util’ler (sadece alarm için) ====== */
const EMA=(arr,p)=>{ const n=arr?.length||0, out=new Array(n).fill(null); if(!arr||n<p) return out;
  const k=2/(p+1); let prev=arr[0]; for(let i=0;i<n;i++){ const v=arr[i]; prev=i===0?v:v*k+prev*(1-k); out[i]=i<p-1?null:prev; } return out; };
const trendSide=(cl)=>{ if(!cl||cl.length<22) return "—"; const e20=EMA(cl,20); const c=cl.at(-1), e=e20.at(-1), eprev=e20.at(-2);
  if([c,e,eprev].some(x=>x==null)) return "—"; const slope=e-eprev; if(c>e && slope>=0) return "LONG"; if(c<e && slope<=0) return "SHORT"; return "—"; };

function useLocalStorage(key, def) {
  const [val, setVal] = useState(()=>{ try { const v=localStorage.getItem(key); return v? JSON.parse(v): def; } catch { return def; } });
  useEffect(()=>{ try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }, [key, val]);
  return [val, setVal];
}

/* ====== Global Sessiz Alarm Yöneticisi ======
   - Favorilerden (localStorage: favSymbols) alır
   - 30 sn’de bir 1m/5m/15m klines çekip EMA20 kırılımını yakalar
   - Bildirim: sessiz browser notification + iç çan rozet + düşen liste
*/
function AlertsManager({ onNewAlert }) {
  const [enabled, setEnabled] = useLocalStorage("alertsEnabled", true);
  const [silent, setSilent]   = useLocalStorage("alertsSilent", true);
  const [alerts, setAlerts]   = useLocalStorage("alertsList", []);
  const tick = useRef(0);

  // izin iste (bir kez)
  useEffect(()=> {
    if (!enabled) return;
    try {
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(()=>{});
      }
    } catch {}
  }, [enabled]);

  useEffect(()=>{
    let timer = null;
    async function run() {
      tick.current++;
      // favoriler
      let favs = [];
      try { favs = JSON.parse(localStorage.getItem("favSymbols")||"[]"); } catch {}
      if (!enabled || !Array.isArray(favs) || favs.length===0) { schedule(); return; }

      const tfs = ["1m","5m","15m"];
      for (const sym of favs.slice(0, 15)) { // güvenli sınır
        for (const tf of tfs) {
          try {
            const u = `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${tf}&limit=80`;
            const res = await fetch(u); const a = await res.json();
            if (!Array.isArray(a)) continue;
            const closes = a.map(x => +x[4]);
            const side = trendSide(closes); // LONG / SHORT / —
            // En son eklenen aynı sembol+tf+side ise tekrar ekleme (spam önleme)
            const last = alerts[0];
            const tag = `${sym}|${tf}|${side}`;
            const lastTag = last?.tag;
            if (side !== "—" && tag !== lastTag) {
              const item = { t: Date.now(), sym, tf, side, tag };
              const next = [item, ...alerts].slice(0, 50);
              setAlerts(next);
              onNewAlert?.(item);
              // Sessiz browser bildirimi
              try {
                if ("Notification" in window && Notification.permission === "granted") {
                  new Notification(`${sym} • ${tf.toUpperCase()} • ${side}`, { silent: !!silent, body: "EMA20 kırılım teyidi", tag });
                }
              } catch {}
            }
          } catch {}
        }
      }
      schedule();
    }
    function schedule(){ timer = setTimeout(run, 30000); } // 30s
    run();
    return ()=> clearTimeout(timer);
  }, [enabled, silent, alerts, setAlerts, onNewAlert]);

  return null; // görünmez
}

function HeaderBar({ bellCount, onOpenBell, alertsEnabled, setAlertsEnabled, alertsSilent, setAlertsSilent }) {
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
      background:"#0f152a", borderBottom:"1px solid #1f2742"
    }}>
      <div style={{ fontWeight:800, color:"#9bd0ff" }}>KriptoGözÜ</div>
      <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:10 }}>
        <button className="btn">Giriş</button>
        <button className="btn">Kayıt Ol</button>
        {/* Bildirim sekmesi */}
        <div style={{ position:"relative" }}>
          <button className="btn" onClick={onOpenBell} title="Bildirimler">
            🔔 Bildirimler {bellCount>0 ? `(${bellCount})` : ""}
          </button>
          <div style={{ position:"absolute", right:0, top:"110%", width:300, background:"#111730",
                        border:"1px solid #223054", borderRadius:10, padding:10, display: onOpenBell.open ? "block" : "none", zIndex:60 }}>
            <div style={{ fontWeight:800, color:"#9bd0ff", marginBottom:6 }}>Uyarı Ayarları</div>
            <label style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
              <input type="checkbox" checked={alertsEnabled} onChange={e=>setAlertsEnabled(e.target.checked)} />
              Uyarıları Aç
            </label>
            <label style={{ display:"flex", alignItems:"center", gap:8 }}>
              <input type="checkbox" checked={alertsSilent} onChange={e=>setAlertsSilent(e.target.checked)} />
              Sessiz bildirim (ses yok)
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MyApp({ Component, pageProps }) {
  const [bellOpen, setBellOpen] = useState(false);
  const [recent, setRecent]     = useLocalStorage("alertsList", []);
  const [alertsEnabled, setAlertsEnabled] = useLocalStorage("alertsEnabled", true);
  const [alertsSilent, setAlertsSilent]   = useLocalStorage("alertsSilent", true);
  const [unread, setUnread] = useState(0);

  useEffect(()=>{ try{ document.body.style.background = "#0b1020"; } catch {} },[]);
  function handleNewAlert(item){ setUnread(x=>x+1); setRecent(prev=>[item, ...prev].slice(0,50)); }

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", background:"#0b1020" }}>
      {/* ÜST KAYAN BANT */}
      <Marquee text="— TANRININ GÖZÜ - KRİPTONUN GÖZÜ —" position="top" />

      {/* ÜST BAR: Giriş / Kayıt Ol / Bildirim sekmesi */}
      <HeaderBar
        bellCount={unread}
        onOpenBell={(...args)=>{ setBellOpen(v=>!v); setUnread(0); }}
        alertsEnabled={alertsEnabled} setAlertsEnabled={setAlertsEnabled}
        alertsSilent={alertsSilent} setAlertsSilent={setAlertsSilent}
      />

      {/* ALARM YÖNETİCİSİ (görünmez) */}
      <AlertsManager onNewAlert={handleNewAlert} />

      {/* İÇERİK */}
      <main style={{ flex:1, position:"relative" }}>
        <Component {...pageProps} />
        {/* Son uyarılar paneli (sağ altta) */}
        <div style={{
          position:"fixed", right:12, bottom:60, width:300,
          background:"#0f152a", border:"1px solid #223054", borderRadius:10, padding:10,
          display: bellOpen ? "block" : "none", zIndex:55
        }}>
          <div style={{ fontWeight:800, color:"#9bd0ff", marginBottom:6 }}>Son Uyarılar</div>
          {(!recent || recent.length===0) && <div style={{opacity:.7}}>Henüz uyarı yok…</div>}
          {recent && recent.slice(0,10).map((it,idx)=>(
            <div key={idx} style={{borderTop:"1px solid #1f2742", padding:"6px 0"}}>
              <div style={{display:"flex", justifyContent:"space-between"}}>
                <b style={{color:"#cfe2ff"}}>{it.sym}</b>
                <span style={{opacity:.7}}>{new Date(it.t).toLocaleTimeString("tr-TR")}</span>
              </div>
              <div style={{display:"flex", justifyContent:"space-between"}}>
                <span style={{opacity:.85}}>TF: <b>{String(it.tf).toUpperCase()}</b></span>
                <b style={{color: it.side==="LONG"?"#22d39a": it.side==="SHORT"?"#ff6b6b":"#9aa4b2"}}>{it.side}</b>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* ALT KAYAN BANT */}
      <Marquee
        text="--- Tanrının Gözü - Kriptonun Gözü --- Bu kanalda paylaşılanlar SPK kuralları gereğince KESİNLİKLE yatırım tavsiyesi değildir."
        position="bottom"
      />
    </div>
  );
}
