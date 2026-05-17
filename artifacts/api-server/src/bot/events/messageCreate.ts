import { Message } from "discord.js";
import { db } from "@workspace/db";
import { userLevelsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { levelFromXp, randomXp, LEVEL_ROLES, totalXpForLevel } from "../utils/levels.js";

const cooldowns = new Map<string, number>();

export async function handleMessageCreate(message: Message) {
  if (message.author.bot || !message.guildId) return;

  const key = `${message.guildId}:${message.author.id}`;
  const now = Date.now();
  const last = cooldowns.get(key) ?? 0;
  if (now - last < 60_000) return;
  cooldowns.set(key, now);

  const guildId = message.guildId;
  const userId = message.author.id;
  const earned = randomXp();

  const [existing] = await db
    .select()
    .from(userLevelsTable)
    .where(and(eq(userLevelsTable.guildId, guildId), eq(userLevelsTable.userId, userId)));

  const oldXp = existing?.xp ?? 0;
  const newXp = oldXp + earned;
  const oldLevel = levelFromXp(oldXp);
  const newLevel = levelFromXp(newXp);

  if (existing) {
    await db
      .update(userLevelsTable)
      .set({ xp: newXp, level: newLevel, lastMessageAt: new Date() })
      .where(and(eq(userLevelsTable.guildId, guildId), eq(userLevelsTable.userId, userId)));
  } else {
    await db.insert(userLevelsTable).values({
      guildId,
      userId,
      xp: newXp,
      level: newLevel,
      lastMessageAt: new Date(),
    });
  }

  if (newLevel > oldLevel) {
    if (message.channel.isTextBased() && !message.channel.isDMBased()) {
      message.channel
        .send(`🎉 ${message.author} leveled up to **Level ${newLevel}**!`)
        .catch(() => null);
    }

    await assignLevelRoles(message, newLevel);
  }
}


async function assignLevelRoles(message: Message, newLevel: number) {
  const guild = message.guild!;
  const member = await guild.members.fetch(message.author.id).catch(() => null);
  if (!member) return;

  for (const milestone of LEVEL_ROLES) {
    if (newLevel >= milestone.level) {
      let role = guild.roles.cache.find((r) => r.name === milestone.name);
      if (!role) {
        role = await guild.roles.create({
          name: milestone.name,
          color: milestone.color,
          reason: "Level milestone role auto-created by bot",
        });
      }
      if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role).catch(() => null);
      }
    }
  }
}
