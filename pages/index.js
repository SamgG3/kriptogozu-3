export async function getServerSideProps() {
  try {
    const res = await fetch("https://fapi.binance.com/fapi/v1/ticker/price?symbol=BTCUSDT");
    const btc = await res.json();
    const res2 = await fetch("https://fapi.binance.com/fapi/v1/ticker/price?symbol=ETHUSDT");
    const eth = await res2.json();

    return {
      props: {
        prices: {
          BTCUSDT: btc.price,
          ETHUSDT: eth.price,
        },
      },
    };
  } catch (err) {
    return {
      props: {
        prices: {
          BTCUSDT: null,
          ETHUSDT: null,
        },
      },
    };
  }
}

export default function Home({ prices }) {
  return (
    <main style={{padding:"24px", fontFamily:"system-ui", color:"#e6e6e6", background:"#0f1115", minHeight:"100vh"}}>
      <h1 style={{color:"#59c1ff"}}>KriptoGözü • Binance Futures</h1>
      <p>BTCUSDT: <b>{prices.BTCUSDT ?? "?"}</b></p>
      <p>ETHUSDT: <b>{prices.ETHUSDT ?? "?"}</b></p>
    </main>
  );
}




