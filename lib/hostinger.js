import { Client as FtpClient } from "basic-ftp";
import SftpClient from "ssh2-sftp-client";
import { Readable } from "stream";

// Salvaguarda: nunca limpiar la raiz del servidor ni una carpeta demasiado
// corta/ambigua por accidente. Exige una carpeta destino real (por ejemplo
// "/public_html"), no solo "/" o vacio.
function assertSafeRemotePath(remotePath) {
  const trimmed = (remotePath || "").trim().replace(/\/+$/, "");
  if (!trimmed || trimmed === "/" || trimmed.length < 3) {
    throw new Error(
      `La carpeta destino "${remotePath}" no parece segura para limpiar automaticamente. ` +
        `Usa una carpeta especifica, por ejemplo /public_html.`
    );
  }
  return trimmed;
}

// files: [{ path, buffer }] ya ordenados
export async function uploadFilesFTP({
  protocol, // "ftp" | "ftps" | "sftp"
  host,
  port,
  username,
  password,
  remotePath,
  files,
  onProgress,
  onStatus,
}) {
  const safePath = assertSafeRemotePath(remotePath);
  const basePath = `${safePath}/`;

  if (protocol === "sftp") {
    const sftp = new SftpClient();
    try {
      await sftp.connect({ host, port: port || 22, username, password });

      // Limpieza: borra toda la carpeta destino (y su contenido) y la vuelve
      // a crear vacia, para que el zip nuevo reemplace por completo lo que
      // habia antes — igual que ya hace el commit atomico en GitHub.
      onStatus?.("Limpiando carpeta remota...");
      const exists = await sftp.exists(safePath);
      if (exists) {
        await sftp.rmdir(safePath, true);
      }
      await sftp.mkdir(safePath, true);

      const madeDirs = new Set([safePath]);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        onProgress?.(file.path, i + 1, files.length);
        const remoteFull = basePath + file.path;
        const dir = remoteFull.substring(0, remoteFull.lastIndexOf("/"));
        if (dir && !madeDirs.has(dir)) {
          await sftp.mkdir(dir, true).catch(() => {});
          madeDirs.add(dir);
        }
        await sftp.put(file.buffer, remoteFull);
      }
    } finally {
      await sftp.end().catch(() => {});
    }
    return;
  }

  // FTP / FTPS via basic-ftp
  const client = new FtpClient();
  client.ftp.verbose = false;
  try {
    await client.access({ host, port: port || 21, user: username, password, secure: protocol === "ftps" });

    // Limpieza: entra a la carpeta destino (creandola si no existe) y borra
    // TODO su contenido de forma recursiva antes de subir nada nuevo.
    onStatus?.("Limpiando carpeta remota...");
    await client.ensureDir(safePath);
    await client.clearWorkingDir();
    await client.cd("/");

    const madeDirs = new Set();
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      onProgress?.(file.path, i + 1, files.length);
      const remoteFull = basePath + file.path;
      const dir = remoteFull.substring(0, remoteFull.lastIndexOf("/"));
      if (dir && !madeDirs.has(dir)) {
        await client.ensureDir(dir);
        await client.cd("/");
        madeDirs.add(dir);
      }
      await client.uploadFrom(Readable.from(file.buffer), remoteFull);
    }
  } finally {
    client.close();
  }
}
