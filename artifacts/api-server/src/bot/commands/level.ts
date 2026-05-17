import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { db } from "@workspace/db";
import { userLevelsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { levelFromXp, xpProgress, LEVEL_ROLES } from "../utils/levels.js";

export const data = new SlashCommandBuilder()
  .setName("rank")
  .setDescription("Show your level and XP rank")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("User to check (defaults to yourself)").setRequired(false)
  );

export const leaderboardData = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Show the top 10 members by level");

export const levelSetupData = new SlashCommandBuilder()
  .setName("levelsetup")
  .setDescription("Create all level milestone roles immediately")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

export async function execute(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const guildId = interaction.guildId!;

  const [row] = await db
    .select()
    .from(userLevelsTable)
    .where(and(eq(userLevelsTable.guildId, guildId), eq(userLevelsTable.userId, target.id)));

  const xp = row?.xp ?? 0;
  const level = levelFromXp(xp);
  const { current, needed } = xpProgress(xp, level);
  const progressBar = buildProgressBar(current, needed);

  const milestone = LEVEL_ROLES.slice().reverse().find((r) => level >= r.level);

  const embed = new EmbedBuilder()
    .setColor(milestone?.color ?? 0x9b59b6)
    .setAuthor({ name: `${target.displayName}'s Rang`, iconURL: target.displayAvatarURL() })
    .setTitle(`${milestone?.name ?? "🔰 Neuling"} — Level ${level}`)
    .setDescription(
      level === 0
        ? "Schreibe Nachrichten im Server um XP zu sammeln und aufzusteigen! 💬"
        : `${target.displayName} ist ein aktives Mitglied der Community! Weiter so! 🚀`
    )
    .addFields(
      { name: "⭐ Level",        value: `**${level}**`,                   inline: true },
      { name: "✨ Gesamt-XP",    value: `**${xp.toLocaleString()}** XP`,  inline: true },
      { name: "📈 Fortschritt",  value: `**${current}** / **${needed}** XP`, inline: true },
      { name: `Fortschrittsbalken bis Level ${level + 1}`, value: progressBar },
    );

  const nextMilestone = LEVEL_ROLES.find((r) => r.level > level);
  if (nextMilestone) {
    embed.addFields({
      name: "🏆 Nächste Meilenstein-Rolle",
      value: `${nextMilestone.name} bei **Level ${nextMilestone.level}** — noch **${nextMilestone.level - level}** Level entfernt`,
    });
  }

  embed
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .setFooter({ text: `Noch ${needed - current} XP bis Level ${level + 1}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export async function executeLeaderboard(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId!;

  const rows = await db
    .select()
    .from(userLevelsTable)
    .where(eq(userLevelsTable.guildId, guildId))
    .orderBy(desc(userLevelsTable.xp))
    .limit(10);

  if (rows.length === 0) {
    await interaction.reply({ content: "No one has earned XP yet. Start chatting!", ephemeral: true });
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];
  const lines = rows.map((r, i) => {
    const lvl = levelFromXp(r.xp);
    const medal = medals[i] ?? `**#${i + 1}**`;
    return `${medal} <@${r.userId}> — Level ${lvl} (${r.xp.toLocaleString()} XP)`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(`🏆 ${interaction.guild!.name} — Top ${rows.length}`)
    .setDescription(
      `Die aktivsten Mitglieder unserer Community! Schreibe Nachrichten um XP zu sammeln und auf die Bestenliste zu kommen.\n\n` +
      lines.join("\n")
    )
    .addFields({
      name: "ℹ️ Wie bekomme ich XP?",
      value: "Schreibe Nachrichten im Server (1x pro Minute) und sammle automatisch **15–25 XP** pro Nachricht.",
    })
    .setThumbnail(interaction.guild!.iconURL({ size: 256 }) ?? null)
    .setFooter({ text: `${interaction.guild!.name} • XP-System • Aktualisiert` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export async function executeLevelSetup(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const guild = await interaction.client.guilds.fetch(interaction.guildId!).catch(() => null);
  if (!guild) {
    await interaction.editReply({ content: "❌ Server konnte nicht geladen werden." });
    return;
  }
  await guild.roles.fetch().catch(() => null);

  const created: string[] = [];
  const existed: string[] = [];

  for (const milestone of LEVEL_ROLES) {
    let role = guild.roles.cache.find((r) => r.name === milestone.name);
    if (!role) {
      await guild.roles.create({
        name: milestone.name,
        color: milestone.color,
        reason: "Level milestone role created by /levelsetup",
      });
      created.push(`${milestone.name} (Level ${milestone.level})`);
    } else {
      existed.push(`${milestone.name} (Level ${milestone.level})`);
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("🎖️ Level Roles Setup Complete")
    .setDescription("All level milestone roles have been created. Members receive them automatically when they reach the required level.")
    .setTimestamp();

  if (created.length > 0) {
    embed.addFields({ name: "✅ Created", value: created.join("\n") });
  }
  if (existed.length > 0) {
    embed.addFields({ name: "⏭️ Already existed", value: existed.join("\n") });
  }

  embed.addFields({
    name: "📋 All Milestone Roles",
    value: LEVEL_ROLES.map((r) => `Level ${r.level} → ${r.name}`).join("\n"),
  });

  await interaction.editReply({ embeds: [embed] });
}

function buildProgressBar(current: number, needed: number, length = 20): string {
  const filled = Math.round((current / needed) * length);
  return "█".repeat(filled) + "░".repeat(length - filled) + ` ${Math.round((current / needed) * 100)}%`;
}
