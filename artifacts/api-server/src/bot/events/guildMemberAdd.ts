import { GuildMember, EmbedBuilder, TextChannel } from "discord.js";
import { db } from "@workspace/db";
import { guildSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function handleGuildMemberAdd(member: GuildMember) {
  const guildId = member.guild.id;

  const [settings] = await db
    .select()
    .from(guildSettingsTable)
    .where(eq(guildSettingsTable.guildId, guildId));

  if (settings?.unverifiedRoleId) {
    await member.roles.add(settings.unverifiedRoleId).catch(() => null);
  }

  if (!settings?.welcomeChannelId) return;

  const channel = member.guild.channels.cache.get(settings.welcomeChannelId) as
    | TextChannel
    | undefined;
  if (!channel) return;

  const guild = member.guild;
  const rawMessage =
    settings.welcomeMessage ??
    "Wir freuen uns, dich hier zu haben! Schau dich um, stell dich vor und hab eine gute Zeit. 🎉";

  const formatted = rawMessage
    .replace("{user}", `${member}`)
    .replace("{server}", guild.name)
    .replace("{count}", guild.memberCount.toString());

  const tips: string[] = [];
  if (settings.rulesChannelId) tips.push(`📋 Lies unsere Regeln in <#${settings.rulesChannelId}>`);
  if (settings.verifyChannelId) tips.push(`✅ Verifiziere dich in <#${settings.verifyChannelId}> um vollen Zugang zu erhalten`);
  if (settings.selfRolesPanelChannelId) tips.push(`🎭 Hol dir deine Rollen in <#${settings.selfRolesPanelChannelId}>`);
  if (settings.ticketCategoryId) tips.push(`🎫 Erstelle ein Support-Ticket falls du Hilfe brauchst`);

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`👋 Willkommen auf ${guild.name}!`)
    .setDescription(`Hey ${member}, **herzlich willkommen**!\n\n${formatted}`)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setImage(guild.bannerURL({ size: 1024 }) ?? null)
    .addFields(
      {
        name: "👤 Dein Account",
        value: [
          `**Benutzername:** ${member.user.tag}`,
          `**Account erstellt:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "🏠 Über den Server",
        value: [
          `**Mitglieder:** ${guild.memberCount.toLocaleString()}`,
          `**Du bist Mitglied #${guild.memberCount}**`,
          `**Server erstellt:** <t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
        ].join("\n"),
        inline: true,
      },
    );

  if (tips.length > 0) {
    embed.addFields({
      name: "🚀 Erste Schritte",
      value: tips.join("\n"),
    });
  }

  embed
    .setFooter({
      text: `${guild.name} • Mitglied #${guild.memberCount}`,
      iconURL: guild.iconURL() ?? undefined,
    })
    .setTimestamp();

  await channel.send({ content: `${member}`, embeds: [embed] }).catch(() => null);
}
