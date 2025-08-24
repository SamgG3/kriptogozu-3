// middleware.js  — /admin’i korur, login olmuş kullanıcıyı /login'den /admin'e yollar
import { NextResponse } from "next/server";

// WebCrypto ile HMAC-SHA256 (Edge Runtime uyumlu)
const enc = new TextEncoder();
async function hmacHex(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return [...new Uint8Array(sigBuf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verify(token, secret) {
  try {
    const [payload, sig] = (token || "").split(".");
    if (!payload || !sig) return null;
    const expected = await hmacHex(secret, payload);
    if (sig !== expected) return null;
    const data = JSON.parse(payload);
    // 24 saatlik geçerlilik
    if (Date.now() - data.t > 24 * 60 * 60 * 1000) return null;
    return data;
  } catch {
    return null;
  }
}

export async function middleware(req) {
  const url = req.nextUrl;
  const path = url.pathname;
  const secret = process.env.SESSION_SECRET || "fallback";

  // /admin ve altını koru
  if (path.startsWith("/admin")) {
    const cookie = req.cookies.get("sess")?.value;
    const ok = cookie && (await verify(cookie, secret));
    if (!ok) {
      const loginUrl = url.clone();
      loginUrl.pathname = "/login";
      return NextResponse.redirect(loginUrl);
    }
  }

  // login olmuşsa /login'e gelirse /admin'e gönder
  if (path === "/login") {
    const cookie = req.cookies.get("sess")?.value;
    const ok = cookie && (await verify(cookie, secret));
    if (ok) {
      const adminUrl = url.clone();
      adminUrl.pathname = "/admin";
      return NextResponse.redirect(adminUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/login"],
};
