import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EncryptedFileSecretStore } from "./secret-store.js";
const directories: string[] = [];
afterEach(() =>
  directories
    .splice(0)
    .forEach((path) => rmSync(path, { recursive: true, force: true })),
);
describe("EncryptedFileSecretStore", () => {
  it("round-trips secrets without plaintext persistence", () => {
    const directory = mkdtempSync(join(tmpdir(), "mentionish-vault-"));
    directories.push(directory);
    const first = new EncryptedFileSecretStore(directory);
    first.set("openai", "sk-super-secret-value");
    expect(new EncryptedFileSecretStore(directory).get("openai")).toBe(
      "sk-super-secret-value",
    );
    expect(readFileSync(join(directory, "secrets.enc"), "utf8")).not.toContain(
      "sk-super-secret-value",
    );
    first.delete("openai");
    expect(first.get("openai")).toBeNull();
  });
});
