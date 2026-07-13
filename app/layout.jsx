import "./globals.css";

export const metadata = {
  title: "crisbofiles — Centro de control de despliegues",
  description: "Administra, actualiza y despliega tus aplicaciones desde una sola interfaz.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
