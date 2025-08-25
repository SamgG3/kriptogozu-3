// pages/_app.js
import dynamic from "next/dynamic";
try { require("../styles/globals.css"); } catch {}

const PriceBar   = dynamic(() => import("../components/PriceBar"),   { ssr:false });
const TopBar     = dynamic(() => import("../components/TopBar"),     { ssr:false });
const WhaleTicker= dynamic(() => import("../components/WhaleTicker"), { ssr:false });

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <PriceBar />
      <TopBar />
      <Component {...pageProps} />
      <WhaleTicker symbols={["BTCUSDT","ETHUSDT","BNBUSDT"]} bigTradeUsd={200000} />
    </>
  );
}
