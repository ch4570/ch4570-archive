import { AdminError } from "@/lib/admin/errors";

export function isVercelRuntime() {
  return Boolean(process.env.VERCEL);
}

export function isAdminEnabled() {
  return process.env.VERCEL_ENV !== "preview" || process.env.ADMIN_PREVIEW_ENABLED === "true";
}

export function requireAdminEnabled() {
  if (!isAdminEnabled()) {
    throw new AdminError(404, "NOT_FOUND", "페이지를 찾을 수 없습니다.");
  }
}

export function adminOrigin() {
  const origin = process.env.ADMIN_ORIGIN?.trim();
  if (origin) return new URL(origin).origin;
  if (isVercelRuntime()) throw new Error("ADMIN_ORIGIN is required on Vercel.");
  return "http://localhost:3000";
}

export function isPublishEnabled() {
  if (!isVercelRuntime()) return process.env.GITHUB_PUBLISH_ENABLED === "true";
  return (
    process.env.VERCEL_ENV === "production" &&
    process.env.GITHUB_PUBLISH_ENABLED === "true"
  );
}

export function requirePublishEnabled() {
  if (!isPublishEnabled()) {
    throw new AdminError(404, "PUBLISH_DISABLED", "이 환경에서는 게시할 수 없습니다.");
  }
}

export function requiredSecret(name: string, minimumLength = 32) {
  const value = process.env[name]?.trim();
  if (!value || value.length < minimumLength) {
    throw new Error(`${name} must contain at least ${minimumLength} characters.`);
  }
  return value;
}
