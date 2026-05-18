import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  Role,
} from "discord.js";
import { db } from "@workspace/db";
import { selfRolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Level milestone role names (never delete these)
const LEVEL_ROLE_NAMES = new Set([
  "🌱 Rookie",
  "⭐ Regular",
  "🔥 Active Member",
  "💎 Veteran",
  "👑 Legend",
]);

export const data = new SlashCommandBuilder()
  .setName("rolecleanup")
  .setDescription("Scannt und löscht ungenutzte Rollen um unter das Rollen-Limit zu bleiben")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand((sub) =>
    sub
      .setName("scan")
      .setDescription("Zeigt alle löschbaren Rollen (kein Löschen — nur Vorschau)")
  )
  .addSubcommand((sub) =>
    sub
      .setName("run")
      .setDescription("Löscht ungenutzte Rollen (mit Bestätigung)")
      .addBooleanOption((opt) =>
        opt
          .setName("auch_leere")
          .setDescription("Auch Rollen löschen die 0 Mitglieder haben aber nicht im Self-Role-System sind? (Standard: ja)")
          .setRequired(false)
      )
  );

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getSafeToDeleteRoles(
  guild: import("discord.js").Guild,
  guildId: string
): Promise<{ safe: Role[]; protected: { role: Role; reason: string }[] }> {
  // Fetch everything fresh
  await guild.roles.fetch();
  await guild.members.fetch();

  // Load self-role IDs from DB
  const selfRoles = await db.select().from(selfRolesTable).where(eq(selfRolesTable.guildId, guildId));
  const selfRoleIds = new Set(selfRoles.map((r) => r.roleId));

  // Bot's highest role position — cannot manage roles above it
  const botMember = guild.members.cache.get(guild.client.user!.id);
  const botHighestPos = botMember?.roles.highest.position ?? 0;

  const safe: Role[] = [];
  const prot: { role: Role; reason: string }[] = [];

  for (const [, role] of guild.roles.cache) {
    // @everyone
    if (role.id === guild.id) continue;

    // Determine why a role is protected
    if (role.managed) {
      prot.push({ role, reason: "Bot/Integration verwaltet" });
      continue;
    }
    if (role.position >= botHighestPos) {
      prot.push({ role, reason: "Über Bot-Rang" });
      continue;
    }
    if (LEVEL_ROLE_NAMES.has(role.name)) {
      prot.push({ role, reason: "Level-Meilenstein" });
      continue;
    }
    if (selfRoleIds.has(role.id)) {
      prot.push({ role, reason: "Self-Role" });
      continue;
    }

    // Count real members (excluding bots)
    const memberCount = role.members.filter((m) => !m.user.bot).size;
    if (memberCount > 0) {
      prot.push({ role, reason: `${memberCount} Mitglied${memberCount === 1 ? "" : "er"}` });
      continue;
    }

    safe.push(role);
  }

  return { safe, protected: prot };
}

function buildScanEmbed(
  safe: Role[],
  prot: { role: Role; reason: string }[],
  totalRoles: number
) {
  const percent = Math.round((totalRoles / 250) * 100);
  const bar = buildBar(percent);

  const embed = new EmbedBuilder()
    .setColor(safe.length === 0 ? 0x2ecc71 : 0xe67e22)
    .setTitle("🔍 Rollen-Analyse")
    .setDescription(
      `**Rollen-Auslastung:** ${totalRoles}/250 ${bar} ${percent}%\n\n` +
      (safe.length === 0
        ? "✅ **Keine löschbaren Rollen gefunden.** Alle Rollen sind in Benutzung oder geschützt."
        : `⚠️ **${safe.length} Rolle${safe.length === 1 ? "" : "n"}** können sicher gelöscht werden.`)
    );

  if (safe.length > 0) {
    const roleList = safe
      .sort((a, b) => a.position - b.position)
      .slice(0, 30)
      .map((r) => `\`${r.name}\``)
      .join(", ");
    embed.addFields({
      name: `🗑️ Löschbare Rollen (${safe.length})`,
      value: roleList + (safe.length > 30 ? `\n…und ${safe.length - 30} weitere` : ""),
    });
  }

  // Show a summary of protected roles by reason
  const byReason = new Map<string, number>();
  for (const { reason } of prot) {
    const key = reason.match(/^\d/)
      ? "Hat Mitglieder"   // collapses "3 Mitglieder", "1 Mitglied" etc.
      : reason;
    byReason.set(key, (byReason.get(key) ?? 0) + 1);
  }
  if (byReason.size > 0) {
    embed.addFields({
      name: `🛡️ Geschützte Rollen (${prot.length})`,
      value: [...byReason.entries()]
        .map(([reason, count]) => `• **${count}** — ${reason}`)
        .join("\n"),
    });
  }

  embed
    .addFields({
      name: "ℹ️ Was wird NIE gelöscht?",
      value:
        "• Rollen mit Mitgliedern\n" +
        "• Bot/Integration Rollen\n" +
        "• Rollen über dem Bot-Rang\n" +
        "• Self-Roles (aus `/selfroles`)\n" +
        "• Level-Meilenstein-Rollen",
    })
    .setFooter({ text: `${totalRoles} Rollen gesamt • Limit: 250` })
    .setTimestamp();

  return embed;
}

function buildBar(percent: number): string {
  const filled = Math.round(percent / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

// ─── /rolecleanup scan ────────────────────────────────────────────────────────
export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.reply({ content: "❌ Nur in einem Server verwendbar.", ephemeral: true });
    return;
  }

  const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    await interaction.reply({ content: "❌ Server konnte nicht geladen werden.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  if (sub === "scan") {
    const { safe, protected: prot } = await getSafeToDeleteRoles(guild, guildId);
    const totalRoles = guild.roles.cache.size - 1; // exclude @everyone
    const embed = buildScanEmbed(safe, prot, totalRoles);

    if (safe.length > 0) {
      embed.setDescription(
        embed.data.description +
        "\n\n> Führe `/rolecleanup run` aus um die Rollen zu löschen."
      );
    }

    await interaction.editReply({ embeds: [embed] });

  } else if (sub === "run") {
    const { safe, protected: prot } = await getSafeToDeleteRoles(guild, guildId);
    const totalRoles = guild.roles.cache.size - 1;

    if (safe.length === 0) {
      const embed = buildScanEmbed(safe, prot, totalRoles);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Show confirmation with preview
    const preview = safe
      .sort((a, b) => a.position - b.position)
      .slice(0, 20)
      .map((r) => `\`${r.name}\``)
      .join(", ");

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("⚠️ Löschung bestätigen")
      .setDescription(
        `Es werden **${safe.length} Rolle${safe.length === 1 ? "" : "n"}** gelöscht.\n\n` +
        `**Aktuelle Auslastung:** ${totalRoles}/250\n` +
        `**Nach Löschung:** ${totalRoles - safe.length}/250\n\n` +
        `**Rollen die gelöscht werden:**\n${preview}` +
        (safe.length > 20 ? `\n…und ${safe.length - 20} weitere` : "")
      )
      .setFooter({ text: "Diese Aktion kann nicht rückgängig gemacht werden!" })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`rolecleanup_confirm_${guildId}`)
        .setLabel(`${safe.length} Rollen löschen`)
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🗑️"),
      new ButtonBuilder()
        .setCustomId("rolecleanup_cancel")
        .setLabel("Abbrechen")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("❌")
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  }
}

// ─── Button handler (confirm / cancel) ───────────────────────────────────────
export async function handleRolecleanupButton(interaction: ButtonInteraction) {
  const id = interaction.customId;

  if (id === "rolecleanup_cancel") {
    const embed = new EmbedBuilder()
      .setColor(0x95a5a6)
      .setTitle("❌ Abgebrochen")
      .setDescription("Keine Rollen wurden gelöscht.");
    await interaction.update({ embeds: [embed], components: [] });
    return;
  }

  if (id.startsWith("rolecleanup_confirm_")) {
    const guildId = id.slice("rolecleanup_confirm_".length);

    await interaction.deferUpdate();

    const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      await interaction.editReply({ content: "❌ Server nicht gefunden.", components: [] });
      return;
    }

    const { safe } = await getSafeToDeleteRoles(guild, guildId);

    let deleted = 0;
    const failed: string[] = [];

    for (const role of safe) {
      const result = await role
        .delete(`rolecleanup — ausgeführt von ${interaction.user.tag}`)
        .catch((err: Error) => { failed.push(`${role.name}: ${err.message}`); return null; });
      if (result) deleted++;
      // Small delay to avoid rate limits
      await new Promise((r) => setTimeout(r, 300));
    }

    const totalAfter = guild.roles.cache.size - 1;
    const percent = Math.round((totalAfter / 250) * 100);
    const bar = buildBar(percent);

    const embed = new EmbedBuilder()
      .setColor(deleted > 0 ? 0x2ecc71 : 0xe74c3c)
      .setTitle("✅ Rollen-Cleanup abgeschlossen")
      .setDescription(
        `**Neue Auslastung:** ${totalAfter}/250 ${bar} ${percent}%`
      )
      .addFields(
        {
          name: "📊 Ergebnis",
          value:
            `🗑️ **${deleted}** Rolle${deleted === 1 ? "" : "n"} gelöscht\n` +
            (failed.length > 0 ? `❌ **${failed.length}** fehlgeschlagen` : "✅ Keine Fehler"),
        },
        ...(failed.length > 0
          ? [{
              name: "⚠️ Fehlgeschlagen",
              value: failed.slice(0, 10).join("\n") + (failed.length > 10 ? `\n…und ${failed.length - 10} weitere` : ""),
            }]
          : [])
      )
      .setFooter({ text: `Ausgeführt von ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed], components: [] });
  }
}
