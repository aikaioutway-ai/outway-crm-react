import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input";

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH?.trim();

if (!Number.isSafeInteger(apiId) || !apiHash) {
  console.error("Set TELEGRAM_API_ID and TELEGRAM_API_HASH before running this script.");
  process.exit(1);
}

const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
  connectionRetries: 5,
});

await client.start({
  phoneNumber: async () => input.text("OUTWAY Telegram phone (+996...): "),
  password: async () => input.text("2FA password (if enabled): "),
  phoneCode: async () => input.text("Telegram login code: "),
  onError: (error) => console.error(error),
});

console.log("\nTELEGRAM_USER_SESSION=\n");
console.log(client.session.save());
console.log("\nSave this value only in Vercel/hosting secrets. Never commit it to GitHub.");
await client.disconnect();
