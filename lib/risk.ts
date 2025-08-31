// risk-tools.js
export function bandWidth(bbUpper, bbLower, price){
  return (bbUpper - bbLower) / price; // örn 0.012 = %1.2
}

export function emaTrendOk({ema20, ema50, ema200}, dir){
  if (dir === "long")  return ema20 > ema50 && ema50 > ema200;
  if (dir === "short") return ema20 < ema50 && ema50 < ema200;
  return false;
}

export function volOk({atr14, price, bbUpper, bbLower}, tf){
  const bw = bandWidth(bbUpper, bbLower, price);
  const atrp = atr14 / price;
  // TF bazlı esnek eşikler:
  const rule = {
    "3m":  { bw: 0.012, atrp: 0.0025 },
    "5m":  { bw: 0.011, atrp: 0.0023 },
    "15m": { bw: 0.010, atrp: 0.0020 },
    "30m": { bw: 0.009,  atrp: 0.0018 },
    "1h":  { bw: 0.008,  atrp: 0.0015 }
  }[tf] || { bw: 0.008, atrp: 0.0015 };
  return (bw >= rule.bw) && (atrp >= rule.atrp);
}

export function kATR(tf){
  return ({ "3m":1.6, "5m":1.5, "15m":1.4, "30m":1.3, "1h":1.3, "4h":1.25, "12h":1.2 }[tf] || 1.3);
}

export function stopsAndTargets({dir, entry, atr14, tf}){
  const k = kATR(tf);
  const R = k * atr14;
  const sl = dir==="long" ? entry - R : entry + R;
  const tp1 = dir==="long" ? entry + 1.0*R : entry - 1.0*R;
  const tp2 = dir==="long" ? entry + 1.5*R : entry - 1.5*R;
  const tp3 = dir==="long" ? entry + 2.0*R : entry - 2.0*R;
  return { k, R, sl, tp1, tp2, tp3, breakevenAt: entry + (dir==="long"? +0.8*R : -0.8*R), trailStartAt: entry + (dir==="long"? +1.2*R : -1.2*R), trailATRpct: 0.7 };
}

export function entryAllowed({dir, ema20, ema50, ema200, bbUpper, bbLower, price, atr14, tf, rsi14, rsiSlope3, hourTR}){
  // Seans filtresi (opsiyonel daha yumuşak)
  if (hourTR >= 3 && hourTR < 7) return false;
  if (!emaTrendOk({ema20, ema50, ema200}, dir)) return false;
  if (!volOk({atr14, price, bbUpper, bbLower}, tf)) return false;
  if (dir==="long"  && !(rsi14>50 && rsiSlope3>0)) return false;
  if (dir==="short" && !(rsi14<50 && rsiSlope3<0)) return false;
  return true;
}
