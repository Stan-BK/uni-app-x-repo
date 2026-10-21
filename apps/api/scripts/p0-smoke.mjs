import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(import.meta.dirname, "../.env");
try {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
} catch {
  // 允许调用方自行 export 环境变量
}

const base = (process.env.API_BASE ?? "http://127.0.0.1:3000/api").replace(
  /\/$/,
  "",
);

async function call(step, method, path, { token, body } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    console.error(`FAIL ${step}: ${res.status}`, data);
    process.exit(1);
  }
  console.log(`OK ${step}: ${res.status}`);
  return data;
}

const now = Date.now();
const startAt = new Date(now + 24 * 3600 * 1000).toISOString();
const endAt = new Date(now + 26 * 3600 * 1000).toISOString();

const health = await call("health", "GET", "/health");
if (health.status !== "ok") {
  console.error("FAIL health: unexpected body", health);
  process.exit(1);
}

const userLogin = await call("user-login", "POST", "/auth/weixin/login", {
  body: { code: "dev" },
});
const userToken = userLogin.accessToken;
const userId = userLogin.user?.id;
if (!userToken || !userId) {
  console.error("FAIL user-login: missing token/user");
  process.exit(1);
}

const activity = await call("publish", "POST", "/me/activities", {
  token: userToken,
  body: {
    title: `P06-smoke-${now}`,
    coverUrl: "https://example.com/p0-6-smoke.jpg",
    category: "观赛",
    rules: "P0-6 冒烟须知",
    place: "P0-6 冒烟地点",
    startAt,
    endAt,
    capacity: 10,
    feeType: "free",
    feeCents: 0,
    publish: true,
  },
});
if (activity.lifecycle !== "published" || !activity.id) {
  console.error("FAIL publish: not published", activity);
  process.exit(1);
}

const registration = await call("register", "POST", "/registrations", {
  token: userToken,
  body: {
    activityId: activity.id,
    name: "冒烟用户",
    phone: "13800138000",
  },
});
if (registration.status !== "confirmed" || !registration.id) {
  console.error("FAIL register: not confirmed", registration);
  process.exit(1);
}

const adminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL ?? "admin@example.com";
const adminPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "ChangeMeNow!";
const adminLogin = await call("admin-login", "POST", "/admin/auth/login", {
  body: { email: adminEmail, password: adminPassword },
});
const adminToken = adminLogin.accessToken;
if (!adminToken) {
  console.error("FAIL admin-login: missing token");
  process.exit(1);
}

await call("freeze", "POST", `/admin/users/${userId}/freeze-publish`, {
  token: adminToken,
  body: { reason: "p0-6-smoke" },
});

const logs = await call(
  "audit",
  "GET",
  `/admin/audit-logs?action=freeze_publish&targetId=${encodeURIComponent(userId)}`,
  { token: adminToken },
);
if (!logs.total || logs.total < 1) {
  console.error("FAIL audit: expected freeze log", logs);
  process.exit(1);
}

await call("unfreeze", "POST", `/admin/users/${userId}/unfreeze-publish`, {
  token: adminToken,
  body: { reason: "p0-6-smoke-restore" },
});

console.log("P0-6 smoke passed");
