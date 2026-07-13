/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
  // ssh2 (dependencia nativa de ssh2-sftp-client) y basic-ftp no deben pasar
  // por el bundler de Next — se cargan tal cual con require() en runtime de
  // Node. Sin esto, el build de Vercel falla intentando empaquetar los
  // binarios/bindings nativos de ssh2.
  experimental: {
    serverComponentsExternalPackages: ["ssh2", "ssh2-sftp-client", "basic-ftp"],
  },
};

module.exports = nextConfig;
