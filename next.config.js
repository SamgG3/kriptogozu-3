const nextConfig = {
  reactStrictMode: true,

  // Uyarı veriyorsa bunu SİL: experimental: { appDir: true }

  async redirects() {
    return [
      { source: "/panel-sinyal", destination: "/sinyal", permanent: false },
      { source: "/signals",      destination: "/sinyal", permanent: false },
    ];
  },
};

module.exports = nextConfig;
