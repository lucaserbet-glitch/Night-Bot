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

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setAuthor({ name: target.displayName, iconURL: target.displayAvatarURL() })
    .setTitle(`Level ${level}`)
    .addFields(
      { name: "XP", value: `${xp.toLocaleString()} total`, inline: true },
      { name: "Progress", value: `${current} / ${needed} XP`, inline: true },
      { name: "\u200b", value: progressBar }
    )
    .setFooter({ text: `${needed - current} XP until level ${level + 1}` });

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
    .setTitle(`🏆 ${interaction.guild!.name} Leaderboard`)
    .setDescription(lines.join("\n"))
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export async function executeLevelSetup(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild!;

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
