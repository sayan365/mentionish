import { randomBytes } from "node:crypto";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export interface LocalInstallationToken {
  token: string;
  path: string;
  created: boolean;
}

export function loadOrCreateLocalInstallationToken(
  dataDirectory: string,
): LocalInstallationToken {
  const directory = resolve(dataDirectory);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, ".installation-token");

  try {
    const existing = readFileSync(path, "utf8").trim();
    if (!tokenPattern.test(existing)) {
      throw new Error(
        "The local installation token file is invalid. Move it aside and restart Mentionish to create a replacement.",
      );
    }
    return { token: existing, path, created: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const token = randomBytes(32).toString("base64url");
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, "wx", 0o600);
    writeFileSync(descriptor, token + "\n", { encoding: "utf8" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      const existing = readFileSync(path, "utf8").trim();
      if (tokenPattern.test(existing)) {
        return { token: existing, path, created: false };
      }
    }
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  return { token, path, created: true };
}
