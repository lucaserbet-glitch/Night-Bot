import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  TextChannel,
} from "discord.js";
import { db } from "@workspace/db";
import { guildSettingsTable, selfRolesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

export const data = new SlashCommandBuilder()
  .setName("selfroles")
  .setDescription("Self-assignable roles system")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand((sub) =>
    sub.setName("setup").setDescription("Create or refresh the self-roles panel in this channel")
  )
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add a self-assignable role (creates it if it doesn't exist)")
      .addStringOption((opt) =>
        opt.setName("name").setDescription("Role name").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("emoji").setDescription("Button emoji (optional)").setRequired(false)
      )
      .addStringOption((opt) =>
        opt.setName("description").setDescription("Short description").setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove a self-assignable role")
      .addStringOption((opt) =>
        opt.setName("name").setDescription("Role name to remove").setRequired(true)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;
  const guild = interaction.guild!;

  if (sub === "add") {
    await interaction.deferReply({ ephemeral: true });
    const name = interaction.options.getString("name", true);
    const emoji = interaction.options.getString("emoji") ?? undefined;
    const description = interaction.options.getString("description") ?? undefined;

    let role = guild.roles.cache.find((r) => r.name.toLowerCase() === name.toLowerCase());
    if (!role) {
      role = await guild.roles.create({ name, reason: "Self-role created by bot" });
    }

    const existing = await db
      .select()
      .from(selfRolesTable)
      .where(and(eq(selfRolesTable.guildId, guildId), eq(selfRolesTable.roleId, role.id)));

    if (existing.length > 0) {
      await interaction.editReply({ content: `❌ **${name}** is already a self-role.` });
      return;
    }

    await db.insert(selfRolesTable).values({
      guildId,
      roleId: role.id,
      roleName: role.name,
      emoji: emoji ?? null,
      description: description ?? null,
    });

    await refreshPanel(interaction, guildId, guild);
    await interaction.editReply({ content: `✅ Role **${role.name}** added to the self-roles panel.` });
  } else if (sub === "remove") {
    await interaction.deferReply({ ephemeral: true });
    const name = interaction.options.getString("name", true);

    const [found] = await db
      .select()
      .from(selfRolesTable)
      .where(and(eq(selfRolesTable.guildId, guildId), eq(selfRolesTable.roleName, name)));

    if (!found) {
      await interaction.editReply({ content: `❌ Role **${name}** not found in self-roles.` });
      return;
    }

    await db.delete(selfRolesTable).where(eq(selfRolesTable.id, found.id));
    await refreshPanel(interaction, guildId, guild);
    await interaction.editReply({ content: `✅ Role **${name}** removed from the self-roles panel.` });
  } else if (sub === "setup") {
    await interaction.deferReply({ ephemeral: true });
    await db
      .insert(guildSettingsTable)
      .values({ guildId, selfRolesPanelChannelId: interaction.channelId })
      .onConflictDoUpdate({
        target: guildSettingsTable.guildId,
        set: { selfRolesPanelChannelId: interaction.channelId },
      });
    await refreshPanel(interaction, guildId, guild);
    await interaction.editReply({ content: `✅ Self-roles panel set up in this channel.` });
  }
}

async function refreshPanel(
  interaction: ChatInputCommandInteraction,
  guildId: string,
  guild: import("discord.js").Guild
) {
  const [settings] = await db
    .select()
    .from(guildSettingsTable)
    .where(eq(guildSettingsTable.guildId, guildId));

  if (!settings?.selfRolesPanelChannelId) return;

  const roles = await db
    .select()
    .from(selfRolesTable)
    .where(eq(selfRolesTable.guildId, guildId));

  const channel = guild.channels.cache.get(settings.selfRolesPanelChannelId) as TextChannel | undefined;
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("🎭 Self-Assignable Roles")
    .setDescription(
      roles.length === 0
        ? "No self-roles configured yet. Use `/selfroles add` to add some."
        : roles
            .map((r) => `${r.emoji ? r.emoji + " " : ""}<@&${r.roleId}>${r.description ? ` — ${r.description}` : ""}`)
            .join("\n")
    )
    .setFooter({ text: "Click a button to get or remove a role" });

  const chunkSize = 5;
  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < roles.length; i += chunkSize) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const r of roles.slice(i, i + chunkSize)) {
      const btn = new ButtonBuilder()
        .setCustomId(`selfrole_toggle_${r.roleId}`)
        .setLabel(r.roleName)
        .setStyle(ButtonStyle.Secondary);
      if (r.emoji) btn.setEmoji(r.emoji);
      row.addComponents(btn);
    }
    components.push(row);
  }

  if (settings.selfRolesPanelMessageId) {
    const old = await channel.messages.fetch(settings.selfRolesPanelMessageId).catch(() => null);
    if (old) {
      await old.edit({ embeds: [embed], components });
      return;
    }
  }

  const msg = await channel.send({ embeds: [embed], components });
  await db
    .insert(guildSettingsTable)
    .values({ guildId, selfRolesPanelMessageId: msg.id })
    .onConflictDoUpdate({
      target: guildSettingsTable.guildId,
      set: { selfRolesPanelMessageId: msg.id },
    });
}

export async function handleSelfroleToggle(interaction: ButtonInteraction, roleId: string) {
  const guild = interaction.guild!;
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: "❌ Could not find your member data.", ephemeral: true });
    return;
  }

  const role = guild.roles.cache.get(roleId);
  if (!role) {
    await interaction.reply({ content: "❌ That role no longer exists.", ephemeral: true });
    return;
  }

  if (member.roles.cache.has(roleId)) {
    await member.roles.remove(role);
    await interaction.reply({ content: `✅ Removed the **${role.name}** role.`, ephemeral: true });
  } else {
    await member.roles.add(role);
    await interaction.reply({ content: `✅ You now have the **${role.name}** role!`, ephemeral: true });
  }
}
