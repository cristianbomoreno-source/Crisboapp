import tls from "node:tls";

// DNS-over-HTTPS publico de Cloudflare — no requiere API key ni cuenta.
async function resolveDNS(domain, type) {
  const res = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`,
    { headers: { Accept: "application/dns-json" }, cache: "no-store" }
  );
  const data = await res.json();
  return (data.Answer || []).map((a) => ({ type: a.type, data: a.data, ttl: a.TTL }));
}

function checkSSL(domain) {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: domain, port: 443, servername: domain, timeout: 6000 },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert || Object.keys(cert).length === 0) {
          resolve({ valid: false, reason: "No se pudo leer el certificado" });
          return;
        }
        const now = new Date();
        const validTo = new Date(cert.valid_to);
        const validFrom = new Date(cert.valid_from);
        resolve({
          valid: socket.authorized && now >= validFrom && now <= validTo,
          issuer: cert.issuer?.O || cert.issuer?.CN,
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          daysRemaining: Math.round((validTo - now) / (1000 * 60 * 60 * 24)),
          authorized: socket.authorized,
          authorizationError: socket.authorizationError,
        });
      }
    );
    socket.on("error", (err) => resolve({ valid: false, reason: err.message }));
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ valid: false, reason: "Timeout conectando por HTTPS" });
    });
  });
}

export async function checkDomain(domain) {
  const clean = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const [aRecords, cname, ssl] = await Promise.all([
    resolveDNS(clean, "A").catch(() => []),
    resolveDNS(clean, "CNAME").catch(() => []),
    checkSSL(clean).catch((e) => ({ valid: false, reason: e.message })),
  ]);

  const issues = [];
  if (aRecords.length === 0 && cname.length === 0) {
    issues.push("No se encontraron registros A ni CNAME — el dominio no apunta a ningun servidor.");
  }
  if (!ssl.valid) {
    issues.push(`SSL con problemas: ${ssl.reason || "certificado invalido o vencido"}.`);
  } else if (ssl.daysRemaining !== undefined && ssl.daysRemaining < 14) {
    issues.push(`El certificado SSL vence en ${ssl.daysRemaining} dias.`);
  }

  return {
    domain: clean,
    aRecords,
    cname,
    ssl,
    healthy: issues.length === 0,
    issues,
  };
}
