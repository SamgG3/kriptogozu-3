export async function getServerSideProps({ req }) {
  // middleware zaten koruyor; burada sadece basit bir bilgi gösterelim
  return { props: { when: new Date().toISOString() } };
}

export default function Admin({ when }) {
  return (
    <main style={{minHeight:"100vh",background:"#0f1115",color:"#e6e6e6",padding:"24px",fontFamily:"system-ui"}}>
      <h1 style={{color:"#59c1ff"}}>KriptoGözü • Admin</h1>
      <p>Hoş geldin Semih. Oturum: <b>{when}</b></p>

      <div style={{marginTop:16}}>
        <a href="/api/auth/logout" style={{color:"#8bd4ff"}}>Çıkış yap</a>
      </div>

      <div style={{marginTop:24}}>
        <a href="/" style={{color:"#8bd4ff"}}>← Ana sayfa</a>
      </div>
    </main>
  );
}
