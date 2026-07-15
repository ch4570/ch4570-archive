import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest, NextResponse } from "next/server";

import { AdminError } from "@/lib/admin/errors";
import { assertLoginOrigin, assertTrustedOrigin } from "@/lib/admin/http";
import {
  createLoginCsrfToken,
  loginCsrfCookieName,
  matchesLoginCsrf,
  setLoginCsrfCookie,
} from "@/lib/admin/login-csrf";
import { hashPassword, verifyPassword } from "@/lib/admin/password";
import {
  adminCookieName,
  clearAdminSessionCookie,
  createAdminSession,
  matchesCsrfToken,
  setAdminSessionCookie,
  verifyAdminSessionToken,
} from "@/lib/admin/session";

test("scrypt hashes verify the right password and reject a wrong password", async () => {
  const encoded = await hashPassword("correct horse battery staple", {
    cost: 1024,
    blockSize: 8,
    parallelization: 1,
    keyLength: 32,
  });

  assert.equal(await verifyPassword("correct horse battery staple", encoded), true);
  assert.equal(await verifyPassword("wrong password", encoded), false);
  await assert.rejects(() => verifyPassword("password", "sha256$invalid"));
});

test("admin sessions reject tampering and session-version rotation", async () => {
  process.env.ADMIN_SESSION_SECRET = "session-secret-that-is-longer-than-thirty-two-characters";
  process.env.ADMIN_SESSION_VERSION = "1";
  delete process.env.VERCEL;

  const created = await createAdminSession();
  const verified = await verifyAdminSessionToken(created.token);
  assert.equal(verified?.subject, "owner");
  assert.equal(verified?.csrf, created.csrf);
  assert.equal(matchesCsrfToken(created.csrf, created.csrf), true);
  assert.equal(matchesCsrfToken(created.csrf, `${created.csrf}x`), false);
  const tokenParts = created.token.split(".");
  const signature = tokenParts[2] as string;
  const signatureOffset = Math.floor(signature.length / 2);
  tokenParts[2] = `${signature.slice(0, signatureOffset)}${signature[signatureOffset] === "A" ? "B" : "A"}${signature.slice(signatureOffset + 1)}`;
  assert.equal(await verifyAdminSessionToken(tokenParts.join(".")), null);

  process.env.ADMIN_SESSION_VERSION = "2";
  assert.equal(await verifyAdminSessionToken(created.token), null);
});

test("session cookies are HttpOnly, strict, host-scoped, and clearable", () => {
  delete process.env.VERCEL;
  const response = NextResponse.json({ ok: true });
  setAdminSessionCookie(response, {
    token: "signed-token",
    expiresAt: Math.floor(Date.now() / 1000) + 60,
  });
  const setCookie = response.headers.get("set-cookie") || "";
  assert.match(setCookie, /HttpOnly/u);
  assert.match(setCookie, /SameSite=strict/ui);
  assert.match(setCookie, /Path=\//u);
  assert.doesNotMatch(setCookie, /Domain=/u);
  assert.equal(adminCookieName(), "ch4570_admin_dev");

  const cleared = NextResponse.json({ ok: true });
  clearAdminSessionCookie(cleared);
  assert.match(cleared.headers.get("set-cookie") || "", /Expires=Thu, 01 Jan 1970/u);
});

test("login CSRF uses a strict host cookie and tolerates browsers without Origin", () => {
  delete process.env.VERCEL;
  process.env.ADMIN_ORIGIN = "http://localhost:3000";
  const token = createLoginCsrfToken();
  const response = NextResponse.json({ ok: true });
  setLoginCsrfCookie(response, token);
  const setCookie = response.headers.get("set-cookie") || "";
  assert.match(setCookie, /HttpOnly/u);
  assert.match(setCookie, /SameSite=strict/ui);
  assert.doesNotMatch(setCookie, /Domain=/u);

  const request = new NextRequest("http://localhost:3000/api/admin/login/", {
    headers: { Cookie: `${loginCsrfCookieName()}=${token}` },
  });
  assert.doesNotThrow(() => assertLoginOrigin(request));
  assert.equal(matchesLoginCsrf(request, token), true);
  assert.equal(matchesLoginCsrf(request, `${token}x`), false);

  const crossOrigin = new NextRequest("http://localhost:3000/api/admin/login/", {
    headers: { Origin: "https://attacker.example" },
  });
  assert.throws(() => assertLoginOrigin(crossOrigin), AdminError);
});

test("mutation origin checks require an exact configured origin", () => {
  process.env.ADMIN_ORIGIN = "https://ch4570-archive.vercel.app";
  const valid = new NextRequest("https://ch4570-archive.vercel.app/api/admin/draft", {
    headers: { Origin: "https://ch4570-archive.vercel.app" },
  });
  assert.doesNotThrow(() => assertTrustedOrigin(valid));

  for (const origin of [
    "https://ch4570-archive.vercel.app.attacker.example",
    "null",
    "https://preview.vercel.app",
  ]) {
    const request = new NextRequest("https://ch4570-archive.vercel.app/api/admin/draft", {
      headers: { Origin: origin },
    });
    assert.throws(
      () => assertTrustedOrigin(request),
      (error) => error instanceof AdminError && error.status === 403,
    );
  }
});
