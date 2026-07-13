import { Client as FtpClient } from "basic-ftp";
import SftpClient from "ssh2-sftp-client";

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
}) {
  const basePath = remotePath.endsWith("/") ? remotePath : `${remotePath}/`;

  if (protocol === "sftp") {
    const sftp = new SftpClient();
    try {
      await sftp.connect({ host, port: port || 22, username, password });
      const madeDirs = new Set();
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

  const client = new FtpClient();
  client.ftp.verbose = false;
  try {
    await client.access({ host, port: port || 21, user: username, password, secure: protocol === "ftps" });
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
      const { Readable } = await import("stream");
      await client.uploadFrom(Readable.from(file.buffer), remoteFull);
    }
  } finally {
    client.close();
  }
}
