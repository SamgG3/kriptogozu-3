// pages/_app.js
import dynamic from "next/dynamic";
// Eğer CSS dosyan yoksa bu satırı silebilirsin:
try { require("../styles/globals.css"); } catch {}

const TopBar = dynamic(() => import("../components/TopBar"), { ssr: false });

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <TopBar />
      <Component {...pageProps} />
    </>
  );
}

