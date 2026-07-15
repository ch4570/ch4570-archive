#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";

import { generateRandomPassword, hashPassword } from "@/lib/admin/password";

const environmentPath = ".env.local";
const managedKeys = new Set([
  "ADMIN_ORIGIN",
  "ADMIN_PASSWORD_HASH",
  "ADMIN_SESSION_SECRET",
  "ADMIN_SESSION_VERSION",
  "GITHUB_PUBLISH_ENABLED",
  "RATE_LIMIT_SECRET",
  "TURSO_AUTH_TOKEN",
  "TURSO_DATABASE_URL",
]);

let existing = "";
try {
  existing = await readFile(environmentPath, "utf8");
} catch {
  // The file is created below on first setup.
}

const retainedLines = existing
  .split(/\r?\n/u)
  .filter((line) => {
    const match = line.match(/^([A-Z0-9_]+)=/u);
    return !match || !managedKeys.has(match[1] as string);
  })
  .filter(Boolean);

const password = generateRandomPassword();
const passwordHash = await hashPassword(password);
const sessionSecret = randomBytes(48).toString("base64url");
const rateLimitSecret = randomBytes(48).toString("base64url");
const managedLines = [
  "ADMIN_ORIGIN=http://localhost:3000",
  `ADMIN_PASSWORD_HASH=${passwordHash.replaceAll("$", "\\$")}`,
  `ADMIN_SESSION_SECRET=${sessionSecret}`,
  "ADMIN_SESSION_VERSION=1",
  "GITHUB_PUBLISH_ENABLED=false",
  `RATE_LIMIT_SECRET=${rateLimitSecret}`,
  "TURSO_AUTH_TOKEN=",
  "TURSO_DATABASE_URL=file:.data/ch4570-archive.db",
];

await writeFile(environmentPath, `${[...retainedLines, ...managedLines].join("\n")}\n`, {
  mode: 0o600,
});
await chmod(environmentPath, 0o600);
execFileSync("security", [
  "add-generic-password",
  "-U",
  "-a",
  "ch4570",
  "-s",
  "ch4570-archive-admin",
  "-w",
  password,
]);

process.stdout.write(
  "Local admin secrets are configured. The password is stored in macOS Keychain service ch4570-archive-admin.\n",
);
