import {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
} from "discord.js";
import { logger } from "../lib/logger.js";
import { handleMessageCreate } from "./events/messageCreate.js";
import { handleGuildMemberAdd } from "./events/guildMemberAdd.js";
import { handleInteractionCreate } from "./events/interactionCreate.js";
import * as ticketCmd from "./commands/ticket.js";
import * as selfrolesCmd from "./commands/selfroles.js";
import * as welcomeCmd from "./commands/welcome.js";
import * as rulesCmd from "./commands/rules.js";
import * as levelCmd from "./commands/level.js";
import * as createserverCmd from "./commands/createserver.js";
import * as aiCmd from "./commands/ai.js";
import * as verifyCmd from "./commands/verify.js";

const token = process.env["DISCORD_BOT_TOKEN"];

if (!token) {
  logger.error("DISCORD_BOT_TOKEN is not set — Discord bot will not start");
} else {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessageReactions,
    ],
  });

  const commands = [
    ticketCmd.data,
    selfrolesCmd.data,
    welcomeCmd.data,
    rulesCmd.data,
    levelCmd.data,
    levelCmd.leaderboardData,
    levelCmd.levelSetupData,
    createserverCmd.data,
    aiCmd.data,
    verifyCmd.data,
  ];

  client.once(Events.ClientReady, async (c) => {
    logger.info({ tag: c.user.tag, guilds: c.guilds.cache.size }, "Discord bot is online");

    const rest = new REST({ version: "10" }).setToken(token);
    try {
      await rest.put(Routes.applicationCommands(c.user.id), {
        body: commands.map((cmd) => cmd.toJSON()),
      });
      logger.info({ count: commands.length }, "Slash commands registered globally");
    } catch (err) {
      logger.error({ err }, "Failed to register slash commands");
    }
  });

  client.on(Events.MessageCreate, (msg) => {
    handleMessageCreate(msg).catch((err) => logger.error({ err }, "messageCreate error"));
  });

  client.on(Events.GuildMemberAdd, (member) => {
    handleGuildMemberAdd(member).catch((err) => logger.error({ err }, "guildMemberAdd error"));
  });

  client.on(Events.InteractionCreate, (interaction) => {
    handleInteractionCreate(interaction).catch((err) =>
      logger.error({ err }, "interactionCreate error")
    );
  });

  client.on(Events.Error, (err) => {
    logger.error({ err }, "Discord client error");
  });

  client.login(token).catch((err) => {
    logger.error({ err }, "Failed to login to Discord");
    process.exit(1);
  });
}
