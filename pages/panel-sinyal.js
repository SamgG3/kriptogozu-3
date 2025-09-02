// pages/panel-sinyal.js
import { useEffect } from "react";
import { useRouter } from "next/router";

export default function PanelSinyal() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/sinyal"); // sekmeye tıklanınca /sinyal sayfasına götür
  }, [router]);
  return null; // ekranda bir şey göstermiyoruz
}
