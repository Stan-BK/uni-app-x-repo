const REQUIRED = ["DATABASE_URL", "JWT_USER_SECRET", "JWT_ADMIN_SECRET"] as const;

export function assertRequiredEnv(
  env: Record<string, string | undefined> = process.env,
): void {
  const missing = REQUIRED.filter((key) => !env[key]?.trim());
  if (missing.length) {
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }
}
