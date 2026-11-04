import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Object storage adapter. Local disk implementation; an S3-compatible adapter can implement
 * the same three functions. Keys are random and never derived from user input.
 */
const root = () => path.resolve(process.env.STORAGE_DIR ?? "./storage");

export async function putObject(buf: Buffer) {
  const key = `${new Date().toISOString().slice(0, 7)}/${randomBytes(18).toString("hex")}`;
  const full = path.join(root(), key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buf, { mode: 0o600 });
  return { key, sha256: createHash("sha256").update(buf).digest("hex") };
}

export async function getObject(key: string) {
  if (!/^[0-9]{4}-[0-9]{2}\/[0-9a-f]{36}$/.test(key)) throw new Error("invalid storage key");
  return readFile(path.join(root(), key));
}

export async function deleteObject(key: string) {
  if (!/^[0-9]{4}-[0-9]{2}\/[0-9a-f]{36}$/.test(key)) return;
  await unlink(path.join(root(), key)).catch(() => undefined);
}
