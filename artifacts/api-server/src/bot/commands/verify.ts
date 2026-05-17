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
      if (ch.id === channel.id) continue;
      if (ch.isThread()) continue;
      if (!("permissionOverwrites" in ch)) continue;
      await ch.permissionOverwrites
        .edit(unverifiedRole.id, { ViewChannel: false })
        .catch(() => null);
    }

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("🔐 Verifizierung erforderlich")
      .setDescription(
        `Willkommen auf **${guild.name}**! 👋\n\n` +
        `Um vollen Zugang zum Server zu erhalten, musst du dich einmalig verifizieren. ` +
        `Das dauert nur einen Klick und bestätigt, dass du unsere Regeln gelesen hast und respektierst.\n\n` +
        `**Was passiert nach der Verifizierung?**\n` +
        `✅ Du erhältst die **✅ Member**-Rolle\n` +
        `✅ Du bekommst Zugriff auf alle Server-Kanäle\n` +
        `✅ Du kannst am Community-Leben teilnehmen\n\n` +
        `Klick einfach auf den Button unten — fertig! 👇`
      )
      .setThumbnail(guild.iconURL({ size: 256 }) ?? null)
      .addFields({
        name: "📋 Hinweis",
        value: "Mit der Verifizierung bestätigst du, dass du unsere Serverregeln gelesen hast und dich daran halten wirst. Bei Verstößen können Maßnahmen ergriffen werden.",
      })
      .setFooter({
        text: `${guild.name} • Verifizierungs-System`,
        iconURL: guild.iconURL() ?? undefined,
      })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("verify_confirm")
        .setLabel("Jetzt verifizieren")
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
        `✅ **Verifizierungs-System ist aktiv!**\n\n` +
        `• Panel gepostet in <#${channel.id}>\n` +
        `• Neue Mitglieder erhalten automatisch **🔒 Unverified**\n` +
        `• Nach der Verifizierung erhalten sie **✅ Member**\n` +
        `• Alle anderen Kanäle sind für Unverified unsichtbar\n\n` +
        `⚠️ Stelle sicher, dass die Bot-Rolle **über** den Rollen 🔒 Unverified und ✅ Member in der Rollenliste steht.`,
    });
  } else {
    await db
      .insert(guildSettingsTable)
      .values({ guildId, verifyChannelId: null, verifyMessageId: null, unverifiedRoleId: null, verifiedRoleId: null })
      .onConflictDoUpdate({
        target: guildSettingsTable.guildId,
        set: { verifyChannelId: null, verifyMessageId: null, unverifiedRoleId: null, verifiedRoleId: null },
      });
    await interaction.reply({ content: "✅ Verifizierungs-System deaktiviert.", ephemeral: true });
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
    await interaction.editReply({ content: "❌ Das Verifizierungs-System ist nicht konfiguriert. Bitte einen Admin informieren." });
    return;
  }

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await interaction.editReply({ content: "❌ Deine Mitgliedsdaten konnten nicht geladen werden. Bitte versuche es erneut." });
    return;
  }

  if (member.roles.cache.has(settings.verifiedRoleId)) {
    await interaction.editReply({
      content: "✅ **Du bist bereits verifiziert!** Du hast vollen Zugang zum Server.",
    });
    return;
  }

  await member.roles.add(settings.verifiedRoleId).catch(() => null);
  await member.roles.remove(settings.unverifiedRoleId).catch(() => null);

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("🎉 Erfolgreich verifiziert!")
    .setDescription(
      `Herzlich Willkommen, ${interaction.user}! Du hast dich erfolgreich verifiziert.\n\n` +
      `Du hast jetzt vollen Zugang zu **${guild.name}** und kannst an allen Kanälen teilnehmen. ` +
      `Wir freuen uns, dich in unserer Community zu haben! 🚀`
    )
    .addFields(
      {
        name: "✅ Was jetzt?",
        value:
          "• Schau dich in den verschiedenen Kanälen um\n" +
          "• Stell dich in einem Vorstellungskanal vor\n" +
          "• Hol dir deine Rollen im Self-Roles Kanal\n" +
          "• Schreib Nachrichten und sammle XP für dein Level!",
      }
    )
    .setThumbnail(interaction.user.displayAvatarURL({ size: 256 }))
    .setFooter({ text: `${guild.name} • Willkommen in der Community!`, iconURL: guild.iconURL() ?? undefined })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
