import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { config } from "./config.js";
import { groupAbout, groupTitle } from "./templates.js";

let clientPromise;

const getClient = async () => {
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = new TelegramClient(
        new StringSession(config.session),
        config.apiId,
        config.apiHash,
        { connectionRetries: 5 }
      );
      await client.connect();
      if (!(await client.checkAuthorization())) {
        throw new Error("TELEGRAM_USER_SESSION is not authorized");
      }
      return client;
    })();
  }
  return clientPromise;
};

const forumFromUpdates = (updates) => {
  const chats = updates?.chats || [];
  const forum = chats.find((chat) => chat?.megagroup || chat?.forum);
  if (!forum) throw new Error("Telegram did not return the created supergroup");
  return forum;
};

export async function createParentForum({ school, transfer }) {
  const client = await getClient();
  const title = groupTitle({ school, transfer });
  const about = groupAbout({ school, transfer });

  // Bot API cannot create a supergroup from scratch. The authorized OUTWAY
  // user account creates it through MTProto, then hands administration to bot.
  const updates = await client.invoke(
    new Api.channels.CreateChannel({
      title,
      about,
      megagroup: true,
      forum: true,
    })
  );

  const forum = forumFromUpdates(updates);
  const inputChannel = await client.getInputEntity(forum);
  const inputPeer = await client.getInputEntity(forum);
  const bot = await client.getEntity(`@${config.botUsername}`);
  const inputBot = await client.getInputEntity(bot);

  await client.invoke(
    new Api.channels.InviteToChannel({
      channel: inputChannel,
      users: [inputBot],
    })
  );

  await client.invoke(
    new Api.channels.EditAdmin({
      channel: inputChannel,
      userId: inputBot,
      adminRights: new Api.ChatAdminRights({
        changeInfo: true,
        deleteMessages: true,
        banUsers: true,
        inviteUsers: true,
        pinMessages: true,
        addAdmins: false,
        manageCall: false,
        anonymous: false,
        manageTopics: true,
        postStories: false,
        editStories: false,
        deleteStories: false,
      }),
      rank: "OUTWAY Bot",
    })
  );

  // Hide Telegram's system "General" topic. The five OUTWAY topics remain.
  try {
    await client.invoke(
      new Api.messages.EditForumTopic({
        peer: inputPeer,
        topicId: 1,
        hidden: true,
      })
    );
  } catch (error) {
    // Some clients/accounts may report TOPIC_NOT_MODIFIED or a temporary
    // Telegram-side error. Group creation should still succeed in that case.
    console.warn("Could not hide General topic:", error?.message || error);
  }

  // Telegram uses -100<channel_id> in Bot API for supergroups/channels.
  const chatId = Number(`-100${forum.id.toString()}`);
  return { chatId, title, inputPeer };
}

export async function pinAndOrderForumTopics(inputPeer, topicIds) {
  if (!topicIds.length) return;
  const client = await getClient();
  await client.invoke(
    new Api.messages.ReorderPinnedForumTopics({
      peer: inputPeer,
      force: true,
      order: topicIds,
    })
  );
}
