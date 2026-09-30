const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
};

const parseIds = (value = "") =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number(item))
    .filter(Number.isSafeInteger);

export const config = {
  botToken: required("TELEGRAM_BOT_TOKEN"),
  botUsername: required("TELEGRAM_BOT_USERNAME").replace(/^@/, ""),
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || "",
  adminIds: parseIds(required("TELEGRAM_ADMIN_IDS")),
  apiId: Number(required("TELEGRAM_API_ID")),
  apiHash: required("TELEGRAM_API_HASH"),
  session: required("TELEGRAM_USER_SESSION"),
};

if (!Number.isSafeInteger(config.apiId)) {
  throw new Error("TELEGRAM_API_ID must be an integer");
}

export const isAdmin = (userId) => config.adminIds.includes(Number(userId));
