import {
  Interaction,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  EmbedBuilder,
} from "discord.js";
import * as ticketCmd from "../commands/ticket.js";
import * as selfrolesCmd from "../commands/selfroles.js";
import * as welcomeCmd from "../commands/welcome.js";
import * as rulesCmd from "../commands/rules.js";
import * as levelCmd from "../commands/level.js";
import * as createserverCmd from "../commands/createserver.js";
import * as aiCmd from "../commands/ai.js";
import * as verifyCmd from "../commands/verify.js";
import * as rolecleanupCmd from "../commands/rolecleanup.js";
import { db } from "@workspace/db";
import { guildSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger.js";

const slashCommands = new Map([
  ["ticket",       ticketCmd.execute],
  ["selfroles",    selfrolesCmd.execute],
  ["welcome",      welcomeCmd.execute],
  ["rules",        rulesCmd.execute],
  ["rank",         levelCmd.execute],
  ["leaderboard",  levelCmd.executeLeaderboard],
  ["levelsetup",   levelCmd.executeLevelSetup],
  ["serversetup",  createserverCmd.execute],
  ["ai",           aiCmd.execute],
  ["verify",       verifyCmd.execute],
  ["rolecleanup",  rolecleanupCmd.execute],
]);

export async function handleInteractionCreate(interaction: Interaction) {
  if (interaction.isChatInputCommand()) {
    logger.info({ command: interaction.commandName, user: interaction.user.tag }, "Slash command received");
    await handleSlashCommand(interaction);
  } else if (interaction.isButton()) {
    logger.info({ customId: interaction.customId, user: interaction.user.tag }, "Button interaction received");
    await handleButton(interaction);
  } else if (interaction.isStringSelectMenu()) {
    logger.info({ customId: interaction.customId, user: interaction.user.tag }, "Select menu interaction received");
    await handleSelectMenu(interaction);
  } else if (interaction.isModalSubmit()) {
    logger.info({ customId: interaction.customId, user: interaction.user.tag }, "Modal submit received");
    await handleModalSubmit(interaction);
  }
}

async function handleSlashCommand(interaction: ChatInputCommandInteraction) {
  const handler = slashCommands.get(interaction.commandName);
  if (!handler) {
    logger.warn({ command: interaction.commandName }, "No handler found for command");
    return;
  }

  try {
    await handler(interaction);
    logger.info({ command: interaction.commandName }, "Command handled successfully");
  } catch (err) {
    logger.error({ err, command: interaction.commandName }, "Command handler error");
    const msg = `❌ Fehler: ${err instanceof Error ? err.message : "Unbekannter Fehler"}`;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: msg }).catch(() => null);
    } else {
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => null);
    }
  }
}

async function handleButton(interaction: ButtonInteraction) {
  const id = interaction.customId;

  try {
    if (id === "ticket_open") {
      await ticketCmd.handleTicketOpen(interaction);
    } else if (id === "ticket_close") {
      await ticketCmd.handleTicketClose(interaction);
    } else if (id === "verify_confirm") {
      await verifyCmd.handleVerifyButton(interaction);
    } else if (id.startsWith("selfrole_toggle_")) {
      const roleId = id.slice("selfrole_toggle_".length);
      await selfrolesCmd.handleSelfroleToggle(interaction, roleId);
    } else if (id.startsWith("rolecleanup_confirm_") || id === "rolecleanup_cancel") {
      await rolecleanupCmd.handleRolecleanupButton(interaction);
    }
  } catch (err) {
    const msg = `❌ Button error: ${err instanceof Error ? err.message : "Unknown error"}`;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: msg }).catch(() => null);
    } else {
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => null);
    }
  }
}

async function handleSelectMenu(interaction: StringSelectMenuInteraction) {
  const id = interaction.customId;

  try {
    if (id === "ticket_category_select") {
      await ticketCmd.handleTicketCategorySelect(interaction);
    }
  } catch (err) {
    const msg = `❌ Select menu error: ${err instanceof Error ? err.message : "Unknown error"}`;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: msg }).catch(() => null);
    } else {
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => null);
    }
  }
}

async function handleModalSubmit(interaction: ModalSubmitInteraction) {
  if (interaction.customId === "rules_set_modal") {
    const rulesContent = interaction.fields.getTextInputValue("rules_text");
    const guildId = interaction.guildId!;

    await db
      .insert(guildSettingsTable)
      .values({ guildId, rulesContent })
      .onConflictDoUpdate({
        target: guildSettingsTable.guildId,
        set: { rulesContent, rulesMessageId: null },
      });

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("✅ Rules Updated")
      .setDescription("Rules saved. Use `/rules show` to post them in the rules channel.");

    await interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => null);
  }
}
