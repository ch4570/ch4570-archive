export class AdminError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AdminError";
  }
}

export function asAdminError(error: unknown) {
  if (error instanceof AdminError) return error;
  const message = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
  return new AdminError(500, "INTERNAL_ERROR", message);
}
