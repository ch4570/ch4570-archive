import { randomBytes, timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { NextRequest, NextResponse } from "next/server";

import { SESSION_DURATION_SECONDS } from "@/lib/admin/constants";
import { isVercelRuntime, requiredSecret } from "@/lib/admin/config";

const ISSUER = "ch4570-archive";
const AUDIENCE = "ch4570-admin";

export type AdminSession = {
  subject: "owner";
  csrf: string;
  version: string;
  expiresAt: number;
};

function sessionSecret() {
  return new TextEncoder().encode(requiredSecret("ADMIN_SESSION_SECRET"));
}

function sessionVersion() {
  return process.env.ADMIN_SESSION_VERSION?.trim() || "1";
}

export function adminCookieName() {
  return isVercelRuntime() ? "__Host-ch4570_admin" : "ch4570_admin_dev";
}

export async function createAdminSession() {
  const csrf = randomBytes(24).toString("base64url");
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  const token = await new SignJWT({ csrf, version: sessionVersion() })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("owner")
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(sessionSecret());
  return { token, csrf, expiresAt };
}

export async function verifyAdminSessionToken(token: string): Promise<AdminSession | null> {
  try {
    const { payload, protectedHeader } = await jwtVerify(token, sessionSecret(), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
      subject: "owner",
    });
    if (
      protectedHeader.alg !== "HS256" ||
      payload.version !== sessionVersion() ||
      typeof payload.csrf !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    return {
      subject: "owner",
      csrf: payload.csrf,
      version: payload.version,
      expiresAt: payload.exp,
    };
  } catch {
    return null;
  }
}

export async function readAdminSession(request: NextRequest) {
  const token = request.cookies.get(adminCookieName())?.value;
  return token ? verifyAdminSessionToken(token) : null;
}

export function setAdminSessionCookie(
  response: NextResponse,
  session: { token: string; expiresAt: number },
) {
  response.cookies.set(adminCookieName(), session.token, {
    httpOnly: true,
    secure: isVercelRuntime(),
    sameSite: "strict",
    path: "/",
    expires: new Date(session.expiresAt * 1000),
    priority: "high",
  });
}

export function clearAdminSessionCookie(response: NextResponse) {
  response.cookies.set(adminCookieName(), "", {
    httpOnly: true,
    secure: isVercelRuntime(),
    sameSite: "strict",
    path: "/",
    expires: new Date(0),
  });
}

export function matchesCsrfToken(expected: string, received: string | null) {
  if (!received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}
