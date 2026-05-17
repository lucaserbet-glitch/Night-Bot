import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
} from "discord.js";
import { db } from "@workspace/db";
import { guildSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const data = new SlashCommandBuilder()
  .setName("welcome")
  .setDescription("Welcome message system")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("setup")
      .setDescription("Set up the welcome channel and message")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Channel where welcome messages are sent")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("message")
          .setDescription("Welcome message. Use {user} for mention, {server} for server name")
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("disable").setDescription("Disable the welcome system")
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  if (sub === "setup") {
    const channel = interaction.options.getChannel("channel", true);
    const message =
      interaction.options.getString("message") ??
      "👋 Welcome to **{server}**, {user}! We're glad to have you here.";

    await db
      .insert(guildSettingsTable)
      .values({ guildId, welcomeChannelId: channel.id, welcomeMessage: message })
      .onConflictDoUpdate({
        target: guildSettingsTable.guildId,
        set: { welcomeChannelId: channel.id, welcomeMessage: message },
      });

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("✅ Welcome System Configured")
      .addFields(
        { name: "Channel", value: `<#${channel.id}>`, inline: true },
        { name: "Message Preview", value: message.replace("{user}", `${interaction.user}`).replace("{server}", interaction.guild!.name) }
      );
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } else {
    await db
      .insert(guildSettingsTable)
      .values({ guildId, welcomeChannelId: null, welcomeMessage: null })
      .onConflictDoUpdate({
        target: guildSettingsTable.guildId,
        set: { welcomeChannelId: null, welcomeMessage: null },
      });
    await interaction.reply({ content: "✅ Welcome system disabled.", ephemeral: true });
  }
}
