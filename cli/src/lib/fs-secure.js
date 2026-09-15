import fs from "node:fs/promises";
import path from "node:path";

/**
 * Write JSON to `filePath` with 0600 permissions (owner read/write only).
 * Creates the parent directory (0700) if it doesn't exist. Writes to a
 * temp file first and renames into place so a crash mid-write never leaves
 * a truncated credentials/policy file behind.
 */
export async function writeSecureJson(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });

  const tmpPath = `${filePath}.${process.pid}.tmp`;
  const json = JSON.stringify(data, null, 2) + "\n";

  const handle = await fs.open(tmpPath, "w", 0o600);
  try {
    await handle.writeFile(json, "utf8");
  } finally {
    await handle.close();
  }

  await fs.rename(tmpPath, filePath);
  // Belt-and-suspenders: rename preserves the temp file's mode on most
  // platforms, but chmod explicitly so we never depend on that.
  await fs.chmod(filePath, 0o600);
}

export async function writeSecureText(filePath, text) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });

  const tmpPath = `${filePath}.${process.pid}.tmp`;
  const handle = await fs.open(tmpPath, "w", 0o600);
  try {
    await handle.writeFile(text, "utf8");
  } finally {
    await handle.close();
  }

  await fs.rename(tmpPath, filePath);
  await fs.chmod(filePath, 0o600);
}

/** Read + parse a JSON file, returning `null` if it doesn't exist. */
export async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

/** Delete a file if it exists; no-op (not an error) if it's already gone. */
export async function removeIfExists(filePath) {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (err) {
    if (err?.code === "ENOENT") return false;
    throw err;
  }
}
