import { Client, GatewayIntentBits, Events } from "discord.js";
import { logger } from "./lib/logger";

const token = process.env["DISCORD_BOT_TOKEN"];

if (!token) {
  logger.error("DISCORD_BOT_TOKEN is not set — bot will not start");
} else {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, (c) => {
    logger.info({ tag: c.user.tag }, "Discord bot is online");
  });

  client.on(Events.MessageCreate, (message) => {
    if (message.author.bot) return;

    if (message.content === "!ping") {
      message.reply("Pong!").catch((err) => {
        logger.error({ err }, "Failed to send ping reply");
      });
    }
  });

  client.on(Events.Error, (err) => {
    logger.error({ err }, "Discord client error");
  });

  client.login(token).catch((err) => {
    logger.error({ err }, "Failed to login to Discord");
    process.exit(1);
  });
}
