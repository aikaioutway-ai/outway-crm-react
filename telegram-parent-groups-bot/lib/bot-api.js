import { config } from "./config.js";

const API = `https://api.telegram.org/bot${config.botToken}`;

export async function botApi(method, payload = {}) {
  const response = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!data.ok) {
    throw new Error(`${method}: ${data.description || "Telegram Bot API error"}`);
  }
  return data.result;
}

export async function setupForumPermissions(chatId) {
  return botApi("setChatPermissions", {
    chat_id: chatId,
    use_independent_chat_permissions: true,
    permissions: {
      can_send_messages: false,
      can_send_audios: false,
      can_send_documents: false,
      can_send_photos: false,
      can_send_videos: false,
      can_send_video_notes: false,
      can_send_voice_notes: false,
      can_send_polls: false,
      can_send_other_messages: false,
      can_add_web_page_previews: false,
      can_change_info: false,
      can_invite_users: false,
      can_pin_messages: false,
      can_manage_topics: false
    }
  });
}

export async function createTopic(chatId, name) {
  return botApi("createForumTopic", { chat_id: chatId, name });
}

export async function sendTopicMessage(chatId, messageThreadId, text) {
  return botApi("sendMessage", {
    chat_id: chatId,
    message_thread_id: messageThreadId,
    text,
    disable_web_page_preview: true,
  });
}

export async function pinMessage(chatId, messageId) {
  return botApi("pinChatMessage", {
    chat_id: chatId,
    message_id: messageId,
    disable_notification: true,
  });
}

export async function createInviteLink(chatId, name) {
  return botApi("createChatInviteLink", {
    chat_id: chatId,
    name: name.slice(0, 32),
  });
}
