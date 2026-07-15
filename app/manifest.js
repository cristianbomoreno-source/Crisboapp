export default function manifest() {
  return {
    name: "crisbofiles",
    short_name: "crisbofiles",
    description: "Centro de control para administrar y desplegar tus aplicaciones.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0b",
    theme_color: "#5e6ad2",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
