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

  if (!settings?.welcomeChannelId) return;

  const channel = member.guild.channels.cache.get(settings.welcomeChannelId) as
    | TextChannel
    | undefined;
  if (!channel) return;

  const rawMessage =
    settings.welcomeMessage ??
    "👋 Welcome to **{server}**, {user}! We're glad to have you here.";

  const formatted = rawMessage
    .replace("{user}", `${member}`)
    .replace("{server}", member.guild.name)
    .replace("{count}", member.guild.memberCount.toString());

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setThumbnail(member.user.displayAvatarURL())
    .setDescription(formatted)
    .setFooter({ text: `Member #${member.guild.memberCount}` })
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => null);
}
