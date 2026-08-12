import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

export interface SecretStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  delete(key: string): void;
}
interface VaultFile {
  version: 1;
  values: Record<string, string>;
}
function privateWrite(path: string, value: string | Buffer): void {
  writeFileSync(path, value, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    /* Windows uses the current profile ACL. */
  }
}
export class EncryptedFileSecretStore implements SecretStore {
  private readonly keyPath: string;
  private readonly vaultPath: string;
  private readonly key: Buffer;
  constructor(dataDirectory: string) {
    this.keyPath = join(dataDirectory, ".secret-key");
    this.vaultPath = join(dataDirectory, "secrets.enc");
    if (!existsSync(this.keyPath)) privateWrite(this.keyPath, randomBytes(32));
    this.key = readFileSync(this.keyPath);
    if (this.key.length !== 32)
      throw new Error("The local secret key is invalid.");
  }
  get(key: string): string | null {
    return this.read().values[key] ?? null;
  }
  set(key: string, value: string): void {
    const vault = this.read();
    vault.values[key] = value;
    this.write(vault);
  }
  delete(key: string): void {
    const vault = this.read();
    delete vault.values[key];
    this.write(vault);
  }
  private read(): VaultFile {
    if (!existsSync(this.vaultPath)) return { version: 1, values: {} };
    const payload = JSON.parse(readFileSync(this.vaultPath, "utf8")) as {
      iv: string;
      tag: string;
      ciphertext: string;
    };
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(payload.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(plaintext) as VaultFile;
  }
  private write(vault: VaultFile): void {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(vault)),
      cipher.final(),
    ]);
    const temporary = this.vaultPath + ".tmp";
    privateWrite(
      temporary,
      JSON.stringify({
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        ciphertext: ciphertext.toString("base64"),
      }),
    );
    renameSync(temporary, this.vaultPath);
  }
}
