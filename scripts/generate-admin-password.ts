#!/usr/bin/env node

import { generateRandomPassword, hashPassword } from "@/lib/admin/password";

const argumentsList = process.argv.slice(2);
const json = argumentsList.includes("--json");
const suppliedPassword = argumentsList.find((argument) => !argument.startsWith("--"));
const password = suppliedPassword || generateRandomPassword();
const hash = await hashPassword(password);

if (json) {
  process.stdout.write(`${JSON.stringify({ password, hash })}\n`);
} else {
  process.stdout.write(`Password: ${password}\nHash: ${hash}\n`);
}
