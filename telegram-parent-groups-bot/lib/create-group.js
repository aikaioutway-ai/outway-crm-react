import { createParentForum } from "./telegram-user.js";
import {
  createInviteLink,
  createTopic,
  pinMessage,
  sendTopicMessage,
  setupForumPermissions,
} from "./bot-api.js";
import { TOPICS } from "./templates.js";

export async function createConfiguredParentGroup({ school, transfer }) {
  const { chatId, title } = await createParentForum({ school, transfer });

  await setupForumPermissions(chatId);

  const topics = {};
  for (const topic of TOPICS) {
    const created = await createTopic(chatId, topic.title);
    const message = await sendTopicMessage(
      chatId,
      created.message_thread_id,
      topic.text({ school, transfer })
    );
    await pinMessage(chatId, message.message_id);
    topics[topic.key] = created.message_thread_id;
  }

  const invite = await createInviteLink(chatId, `${school} #${transfer}`);

  return {
    chatId,
    title,
    inviteLink: invite.invite_link,
    topics,
  };
}
