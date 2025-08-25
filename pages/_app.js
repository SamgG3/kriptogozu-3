// pages/_app.js
// ...
const WhaleTicker= dynamic(() => import("../components/WhaleTicker"), { ssr:false });

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <PriceBar />
      <TopBar />
      <Component {...pageProps} />
      {/* Balina akışı kapalı; bant duruyor */}
      <WhaleTicker enabled={false} staticText="KriptoGözü • canlı veri • hoş geldiniz" />
    </>
  );
}
