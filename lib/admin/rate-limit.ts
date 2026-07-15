import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";

import {
  LOGIN_BLOCK_SECONDS,
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_SECONDS,
} from "@/lib/admin/constants";
import { isVercelRuntime, requiredSecret } from "@/lib/admin/config";
import { ensureDatabase } from "@/lib/admin/database";

function rateLimitSecret() {
  if (!isVercelRuntime() && !process.env.RATE_LIMIT_SECRET) {
    return "local-development-rate-limit-secret";
  }
  return requiredSecret("RATE_LIMIT_SECRET");
}

export function loginBucketKey(request: NextRequest) {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for") ||
    "127.0.0.1";
  const address = forwarded.split(",", 1)[0]?.trim() || "unknown";
  return createHmac("sha256", rateLimitSecret()).update(address).digest("hex");
}

export async function loginRetryAfterSeconds(keyHash: string, now = Date.now()) {
  const client = await ensureDatabase();
  const result = await client.execute({
    sql: "SELECT blocked_until FROM login_buckets WHERE key_hash = ? LIMIT 1",
    args: [keyHash],
  });
  const blockedUntil = Number(result.rows[0]?.blocked_until || 0);
  return blockedUntil > now ? Math.ceil((blockedUntil - now) / 1000) : 0;
}

export async function recordLoginFailure(keyHash: string, now = Date.now()) {
  const client = await ensureDatabase();
  const windowMilliseconds = LOGIN_WINDOW_SECONDS * 1000;
  const blockMilliseconds = LOGIN_BLOCK_SECONDS * 1000;
  await client.execute({
    sql: `INSERT INTO login_buckets
      (key_hash, window_started, failures, blocked_until, updated_at)
      VALUES (?, ?, 1, 0, ?)
      ON CONFLICT(key_hash) DO UPDATE SET
        failures = CASE
          WHEN ? - window_started >= ? THEN 1
          ELSE failures + 1
        END,
        blocked_until = CASE
          WHEN ? - window_started >= ? THEN 0
          WHEN failures + 1 >= ? THEN MAX(blocked_until, ? + ?)
          ELSE blocked_until
        END,
        window_started = CASE
          WHEN ? - window_started >= ? THEN ?
          ELSE window_started
        END,
        updated_at = ?`,
    args: [
      keyHash,
      now,
      now,
      now,
      windowMilliseconds,
      now,
      windowMilliseconds,
      LOGIN_MAX_FAILURES,
      now,
      blockMilliseconds,
      now,
      windowMilliseconds,
      now,
      now,
    ],
  });
  return loginRetryAfterSeconds(keyHash, now);
}

export async function clearLoginFailures(keyHash: string) {
  const client = await ensureDatabase();
  await client.execute({
    sql: "DELETE FROM login_buckets WHERE key_hash = ?",
    args: [keyHash],
  });
}
