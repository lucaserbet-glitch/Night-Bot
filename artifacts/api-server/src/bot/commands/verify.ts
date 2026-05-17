import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  TextChannel,
} from "discord.js";
import { db } from "@workspace/db";
import { guildSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const data = new SlashCommandBuilder()
  .setName("verify")
  .setDescription("Verification system")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("setup")
      .setDescription("Set up the verification system")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Channel where the verify button is posted")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("disable").setDescription("Disable the verification system")
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;
  const guild = interaction.guild!;

  if (sub === "setup") {
    await interaction.deferReply({ ephemeral: true });
    const channel = interaction.options.getChannel("channel", true) as TextChannel;

    let unverifiedRole = guild.roles.cache.find((r) => r.name === "🔒 Unverified");
    if (!unverifiedRole) {
      unverifiedRole = await guild.roles.create({
        name: "🔒 Unverified",
        color: 0x95a5a6,
        reason: "Verify system — unverified role",
      });
    }

    let verifiedRole = guild.roles.cache.find((r) => r.name === "✅ Member");
    if (!verifiedRole) {
      verifiedRole = await guild.roles.create({
        name: "✅ Member",
        color: 0x2ecc71,
        reason: "Verify system — verified member role",
      });
    }

    for (const [, ch] of guild.channels.cache) {
      if (ch.id === channel.id) return;
      if (ch.isThread()) continue;
      if (!("permissionOverwrites" in ch)) continue;
      await ch.permissionOverwrites
        .edit(unverifiedRole.id, { ViewChannel: false })
        .catch(() => null);
    }

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("✅ Verification Required")
      .setDescription(
        "Welcome! To gain access to the server, please click the button below to verify yourself.\n\n" +
          "By verifying, you confirm that you have read and agree to follow our server rules."
      )
      .setFooter({ text: guild.name })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("verify_confirm")
        .setLabel("Verify Me")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success)
    );

    const [existing] = await db
      .select()
      .from(guildSettingsTable)
      .where(eq(guildSettingsTable.guildId, guildId));

    if (existing?.verifyMessageId) {
      const old = await channel.messages.fetch(existing.verifyMessageId).catch(() => null);
      if (old) await old.delete().catch(() => null);
    }

    const msg = await channel.send({ embeds: [embed], components: [row] });

    await db
      .insert(guildSettingsTable)
      .values({
        guildId,
        verifyChannelId: channel.id,
        verifyMessageId: msg.id,
        unverifiedRoleId: unverifiedRole.id,
        verifiedRoleId: verifiedRole.id,
      })
      .onConflictDoUpdate({
        target: guildSettingsTable.guildId,
        set: {
          verifyChannelId: channel.id,
          verifyMessageId: msg.id,
          unverifiedRoleId: unverifiedRole.id,
          verifiedRoleId: verifiedRole.id,
        },
      });

    await interaction.editReply({
      content:
        `✅ Verification system active!\n\n` +
        `• Panel posted in <#${channel.id}>\n` +
        `• New members get the **🔒 Unverified** role automatically\n` +
        `• After verifying they receive **✅ Member**\n\n` +
        `⚠️ Make sure the bot role is above **🔒 Unverified** and **✅ Member** in your role list.`,
    });
  } else {
    await db
      .insert(guildSettingsTable)
      .values({ guildId, verifyChannelId: null, verifyMessageId: null, unverifiedRoleId: null, verifiedRoleId: null })
      .onConflictDoUpdate({
        target: guildSettingsTable.guildId,
        set: { verifyChannelId: null, verifyMessageId: null, unverifiedRoleId: null, verifiedRoleId: null },
      });
    await interaction.reply({ content: "✅ Verification system disabled.", ephemeral: true });
  }
}

export async function handleVerifyButton(interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const guildId = interaction.guildId!;
  const guild = interaction.guild!;

  const [settings] = await db
    .select()
    .from(guildSettingsTable)
    .where(eq(guildSettingsTable.guildId, guildId));

  if (!settings?.unverifiedRoleId || !settings.verifiedRoleId) {
    await interaction.editReply({ content: "❌ Verification system is not configured." });
    return;
  }

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await interaction.editReply({ content: "❌ Could not find your member data." });
    return;
  }

  if (member.roles.cache.has(settings.verifiedRoleId)) {
    await interaction.editReply({ content: "✅ You are already verified!" });
    return;
  }

  await member.roles.add(settings.verifiedRoleId).catch(() => null);
  await member.roles.remove(settings.unverifiedRoleId).catch(() => null);

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("✅ Verified!")
    .setDescription(`Welcome to **${guild.name}**, ${interaction.user}! You now have full access to the server.`);

  await interaction.editReply({ embeds: [embed] });
}
