// pages/_app.js
import dynamic from "next/dynamic";
import "../styles/globals.css"; // yoksa bu satırı silebilirsin

const TopBar = dynamic(() => import("../components/TopBar"), { ssr: false });

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <TopBar />
      <Component {...pageProps} />
    </>
  );
}
