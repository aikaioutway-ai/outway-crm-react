import { botApi } from "../lib/bot-api.js";
import { config, isAdmin } from "../lib/config.js";
import { createConfiguredParentGroup } from "../lib/create-group.js";
import { schoolByCode, SCHOOLS } from "../lib/templates.js";

const helpText = () =>
  "OUTWAY — создание родительских групп\n\n" +
  "Команда:\n/create SCHOOL TRANSFER\n\n" +
  "Пример:\n/create TENSAY 1\n\n" +
  `Школы: ${SCHOOLS.map((s) => s.code).join(", ")}`;

const send = (chatId, text) => botApi("sendMessage", { chat_id: chatId, text });

const parseCreate = (text) => {
  const parts = text.trim().split(/\s+/);
  if (parts[0]?.split("@")[0].toLowerCase() !== "/create") return null;
  if (parts.length !== 3) throw new Error("FORMAT");

  const school = schoolByCode(parts[1]);
  const transfer = Number(parts[2]);
  if (!school) throw new Error("SCHOOL");
  if (!Number.isInteger(transfer) || transfer < 1 || transfer > 99) {
    throw new Error("TRANSFER");
  }
  return { school: school.label, schoolCode: school.code, transfer };
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  if (config.webhookSecret) {
    const secret = req.headers["x-telegram-bot-api-secret-token"];
    if (secret !== config.webhookSecret) return res.status(401).send("Unauthorized");
  }

  // Reply immediately to Telegram so it doesn't retry a long-running create request.
  res.status(200).json({ ok: true });

  const message = req.body?.message;
  if (!message?.text || !message?.from?.id) return;
  if (message.chat?.type !== "private") return;

  const userId = message.from.id;
  const chatId = message.chat.id;
  if (!isAdmin(userId)) {
    await send(chatId, "Доступ к этому боту ограничен администраторами OUTWAY.");
    return;
  }

  const text = message.text.trim();
  if (/^\/(start|help)(@\w+)?$/i.test(text)) {
    await send(chatId, helpText());
    return;
  }

  let args;
  try {
    args = parseCreate(text);
  } catch (error) {
    if (error.message === "FORMAT") {
      await send(chatId, "Формат: /create SCHOOL TRANSFER\nНапример: /create TENSAY 1");
    } else if (error.message === "SCHOOL") {
      await send(chatId, `Школа не найдена. Доступно: ${SCHOOLS.map((s) => s.code).join(", ")}`);
    } else {
      await send(chatId, "Номер трансфера должен быть целым числом от 1 до 99.");
    }
    return;
  }

  if (!args) {
    await send(chatId, helpText());
    return;
  }

  await send(chatId, `Создаю ${args.school} | Трансфер #${args.transfer}…`);

  try {
    const result = await createConfiguredParentGroup(args);
    await send(
      chatId,
      `✅ Группа готова\n\n${result.title}\n${result.inviteLink}\n\n` +
        "Созданы темы:\n📢 Информация\n📍 Геолокация\n🕒 Расписание\n💰 Оплаты\n💬 Обратная связь\n\n" +
        "Родителям по умолчанию запрещена отправка сообщений."
    );
  } catch (error) {
    console.error(error);
    await send(chatId, `❌ Не удалось создать группу.\n${error.message}`);
  }
}
