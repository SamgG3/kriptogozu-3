// utils/signalEngine.js

const clamp = (x, a, b)=> Math.max(a, Math.min(b, x));
const pct = (a,b)=> (a-b)/b;

function sessionOK(nowTs, tzOffsetMin=180){ // Europe/Istanbul +03:00
  const t = new Date(nowTs + tzOffsetMin*60000);
  const h = t.getUTCHours(), m = t.getUTCMinutes();
  const mins = h*60 + m;           // basit saat filtresi
  return mins >= 600 && mins <= 1439; // 10:00–23:59
}

export function positionSizeUSDT(equityUSDT, riskPct, entry, stop, leverage=5){
  const riskUSDT = equityUSDT * riskPct;
  const slDist = Math.abs(entry - stop);
  if (slDist <= 0) return 0;
  // Not: sözleşme USDT marjinli kabul; basit yaklaşık
  const qty = (riskUSDT / slDist) * (1/leverage);
  return Math.max(0, qty);
}

export function genSignal(bar, ind, prevInd, opts={}){
  const now = bar.ts || Date.now();
  const feeSlippage = opts.feeSlippage ?? 0.001; // ~0.10% güvenli varsayım
  const maxLev = clamp(opts.maxLeverage ?? 10, 1, 10);
  const cooldownOk = true; // dışarıdan sem4Cooldown ile yönet (örn. 30dk)
  const sessOK = sessionOK(now);
  if (!sessOK || !cooldownOk) return null;

  const price = bar.close;
  const atr = ind.atr14;
  const vol = atr/price;

  // Volatilite aralığı (sığ/choppy ve tufan dönemlerini ele)
  if (vol < 0.003 || vol > 0.02) return null;

  // Trend filtresi
  const up = ind.ema20 > ind.ema50 && ind.ema50 > ind.ema200;
  const dn = ind.ema20 < ind.ema50 && ind.ema50 < ind.ema200;

  const nearEMA20 = Math.abs(price - ind.ema20) <= 0.5*atr;
  const stochUp = ind.stochK > ind.stochD && (prevInd ? prevInd.stochK <= prevInd.stochD : true);
  const stochDn = ind.stochK < ind.stochD && (prevInd ? prevInd.stochK >= prevInd.stochD : true);
  const rsiPB   = ind.rsi14 >= 40 && ind.rsi14 <= 60;

  let side = null;
  if (up && nearEMA20 && rsiPB && stochUp && price > ind.bbMid) side = "long";
  if (dn && nearEMA20 && rsiPB && stochDn && price < ind.bbMid) side = "short";
  if (!side) return null;

  // ATR tabanlı seviye
  const SLmul = 1.2, TPmul = [0.8, 1.6, 2.4];
  const entry = price;
  const sl = side === "long" ? entry - SLmul*atr : entry + SLmul*atr;
  const tps = TPmul.map(k => side === "long" ? entry + k*atr : entry - k*atr);

  // Ücret + slippage filtresi
  if (feeSlippage >= 0.002) return null; // çok pahalı ortam

  // Basit güven skoru (admin hariç 77 tavanını UI'da uygula)
  let score = 0;
  score += (up || dn) ? 0.35 : 0;
  score += nearEMA20 ? 0.15 : 0;
  score += rsiPB ? 0.15 : 0;
  score += (side==="long" ? stochUp : stochDn) ? 0.15 : 0;
  score += (vol >= 0.005 && vol <= 0.015) ? 0.20 : 0; // tatlı volatilite
  const confidence = Math.round(score*100); // UI'da mask: Math.min(confidence,77)

  // RR ve beklenen değer ön kontrolü
  const rr1 = Math.abs(tps[0]-entry)/Math.abs(entry-sl); // ≈ 0.8/1.2 = 0.67
  const rr2 = Math.abs(tps[1]-entry)/Math.abs(entry-sl); // ≈ 1.33
  const rr3 = Math.abs(tps[2]-entry)/Math.abs(entry-sl); // ≈ 2.0
  if (rr1 < 0.5) return null; // çok kötü dağılım

  return {
    side, entry, sl, tps,
    leverage: Math.min(maxLev, 10),
    confidence,
    meta: {
      vol, rr:[rr1,rr2,rr3], feeSlippage,
      rules: {trend: up||dn, nearEMA20, rsiPB, stoch: side==="long"?stochUp:stochDn}
    }
  };
}
