import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH?.trim();

if (!Number.isSafeInteger(apiId) || !apiHash) {
  console.error("Set TELEGRAM_API_ID and TELEGRAM_API_HASH before running this script.");
  process.exit(1);
}

const rl = createInterface({ input, output });
const ask = async (prompt) => (await rl.question(prompt)).trim();

const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
  connectionRetries: 5,
});

try {
  await client.start({
    phoneNumber: async () => ask("OUTWAY Telegram phone (+996...): "),
    password: async () => ask("2FA password (if enabled): "),
    phoneCode: async () => ask("Telegram login code: "),
    onError: (error) => console.error(error),
  });

  console.log("\nTELEGRAM_USER_SESSION=\n");
  console.log(client.session.save());
  console.log("\nSave this value only in Vercel/hosting secrets. Never commit it to GitHub.");
} finally {
  rl.close();
  await client.disconnect();
}
