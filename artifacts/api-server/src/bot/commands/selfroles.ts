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

const DEFAULT_SELF_ROLES = [
  { name: "🎮 Gamer",        emoji: "🎮", description: "Into gaming" },
  { name: "🎵 Music Fan",    emoji: "🎵", description: "Loves music" },
  { name: "🎨 Artist",       emoji: "🎨", description: "Creative mind" },
  { name: "📺 Anime Fan",    emoji: "📺", description: "Watches anime" },
  { name: "🔧 Tech Nerd",    emoji: "🔧", description: "Loves technology" },
  { name: "📸 Photography",  emoji: "📸", description: "Captures moments" },
];

type RoleDef = { name: string; emoji: string; description: string; color?: number };

const ROLE_CATEGORIES: Record<string, { label: string; roles: RoleDef[] }> = {
  gaming: {
    label: "🎮 Gaming",
    roles: [
      { name: "🎮 Gamer",           emoji: "🎮", description: "Allgemeines Gaming",       color: 0x1abc9c },
      { name: "⚔️ RPG",              emoji: "⚔️",  description: "Rollenspiele",             color: 0xe74c3c },
      { name: "🔫 Shooter",          emoji: "🔫", description: "Ego-/Third-Person Shooter", color: 0x95a5a6 },
      { name: "⚽ Sports Games",     emoji: "⚽", description: "Sportspiele",               color: 0x2ecc71 },
      { name: "🧠 Strategy",         emoji: "🧠", description: "Strategie & Aufbau",        color: 0x9b59b6 },
      { name: "🃏 Card Games",       emoji: "🃏", description: "Kartenspiele",              color: 0xf1c40f },
      { name: "🏎️ Racing",           emoji: "🏎️", description: "Rennspiele",               color: 0xe67e22 },
      { name: "🌍 Open World",       emoji: "🌍", description: "Open World Spiele",         color: 0x27ae60 },
      { name: "👾 Retro Gaming",     emoji: "👾", description: "Klassische Spiele",         color: 0x8e44ad },
      { name: "📱 Mobile Gaming",    emoji: "📱", description: "Mobile Games",              color: 0x3498db },
    ],
  },
  music: {
    label: "🎵 Musik",
    roles: [
      { name: "🎵 Music Fan",        emoji: "🎵", description: "Genereller Musikfan",       color: 0xf1c40f },
      { name: "🎸 Rock",             emoji: "🎸", description: "Rock & Metal",              color: 0xe74c3c },
      { name: "🎤 Pop",              emoji: "🎤", description: "Pop-Musik",                 color: 0xff69b4 },
      { name: "🎧 Hip-Hop",          emoji: "🎧", description: "Hip-Hop & Rap",             color: 0x2c3e50 },
      { name: "🎹 Electronic",       emoji: "🎹", description: "EDM / Electronic",          color: 0x9b59b6 },
      { name: "🎺 Jazz & Blues",     emoji: "🎺", description: "Jazz und Blues",            color: 0xe67e22 },
      { name: "🎻 Classical",        emoji: "🎻", description: "Klassische Musik",          color: 0xbdc3c7 },
      { name: "🌴 R&B",              emoji: "🌴", description: "R&B & Soul",               color: 0x8e44ad },
      { name: "🤠 Country",          emoji: "🤠", description: "Country-Musik",             color: 0xd4a017 },
      { name: "🎙️ K-Pop",            emoji: "🎙️", description: "K-Pop & J-Pop",            color: 0xff1493 },
    ],
  },
  anime: {
    label: "📺 Anime & Manga",
    roles: [
      { name: "📺 Anime Fan",        emoji: "📺", description: "Allgemeiner Anime-Fan",     color: 0xff6b9d },
      { name: "⚔️ Shōnen",           emoji: "⚔️",  description: "Action-Anime",             color: 0xe74c3c },
      { name: "💕 Shōjo",            emoji: "💕", description: "Romantik-Anime",            color: 0xff69b4 },
      { name: "🧬 Sci-Fi Anime",     emoji: "🧬", description: "Science-Fiction Anime",    color: 0x3498db },
      { name: "😂 Comedy Anime",     emoji: "😂", description: "Komödie Anime",            color: 0xf1c40f },
      { name: "📖 Manga Reader",     emoji: "📖", description: "Liest Manga",              color: 0x9b59b6 },
      { name: "🎌 Japankultur",      emoji: "🎌", description: "Interesse an Japankultur", color: 0xe74c3c },
      { name: "🎮 Gacha Games",      emoji: "🎮", description: "Gacha & Anime-Spiele",     color: 0x1abc9c },
    ],
  },
  colors: {
    label: "🎨 Farbrollen",
    roles: [
      { name: "❤️ Rot",              emoji: "❤️", description: "Farbrolle Rot",             color: 0xe74c3c },
      { name: "🧡 Orange",           emoji: "🧡", description: "Farbrolle Orange",          color: 0xe67e22 },
      { name: "💛 Gelb",             emoji: "💛", description: "Farbrolle Gelb",            color: 0xf1c40f },
      { name: "💚 Grün",             emoji: "💚", description: "Farbrolle Grün",            color: 0x2ecc71 },
      { name: "💙 Blau",             emoji: "💙", description: "Farbrolle Blau",            color: 0x3498db },
      { name: "💜 Lila",             emoji: "💜", description: "Farbrolle Lila",            color: 0x9b59b6 },
      { name: "🩷 Pink",             emoji: "🩷", description: "Farbrolle Pink",            color: 0xff69b4 },
      { name: "🖤 Schwarz",          emoji: "🖤", description: "Farbrolle Schwarz",         color: 0x2c3e50 },
      { name: "🤍 Weiß",             emoji: "🤍", description: "Farbrolle Weiß",           color: 0xecf0f1 },
      { name: "🩶 Grau",             emoji: "🩶", description: "Farbrolle Grau",            color: 0x95a5a6 },
    ],
  },
  hobbies: {
    label: "🌟 Hobbys",
    roles: [
      { name: "📸 Photography",      emoji: "📸", description: "Fotografie",                color: 0x2c3e50 },
      { name: "🎨 Art & Drawing",    emoji: "🎨", description: "Zeichnen & Kunst",          color: 0xe74c3c },
      { name: "📚 Leser",            emoji: "📚", description: "Liest gerne Bücher",        color: 0x8e44ad },
      { name: "🍳 Kochen",           emoji: "🍳", description: "Kocht gerne",               color: 0xe67e22 },
      { name: "🏋️ Sport & Fitness",  emoji: "🏋️", description: "Sport & Fitness",          color: 0x27ae60 },
      { name: "✈️ Reisen",            emoji: "✈️", description: "Reisebegeistert",           color: 0x3498db },
      { name: "🎭 Theater & Film",   emoji: "🎭", description: "Film & Serien",             color: 0x9b59b6 },
      { name: "🐾 Tierliebhaber",    emoji: "🐾", description: "Mag Tiere",                 color: 0xd4a017 },
      { name: "🌿 Natur & Wandern",  emoji: "🌿", description: "In der Natur unterwegs",   color: 0x2ecc71 },
      { name: "🎲 Brettspiele",      emoji: "🎲", description: "Brettspiele & Tabletop",   color: 0x1abc9c },
    ],
  },
  tech: {
    label: "🔧 Technik",
    roles: [
      { name: "💻 Programmer",       emoji: "💻", description: "Programmiert gerne",        color: 0x3498db },
      { name: "🎨 Designer",         emoji: "🎨", description: "Grafik & UI-Design",        color: 0xff69b4 },
      { name: "🔒 Cybersecurity",    emoji: "🔒", description: "IT-Sicherheit",             color: 0xe74c3c },
      { name: "🤖 AI & ML",          emoji: "🤖", description: "Künstliche Intelligenz",   color: 0x9b59b6 },
      { name: "🌐 Web Dev",          emoji: "🌐", description: "Webentwicklung",            color: 0x1abc9c },
      { name: "📱 Mobile Dev",       emoji: "📱", description: "App-Entwicklung",           color: 0x2ecc71 },
      { name: "🖥️ Hardware",         emoji: "🖥️", description: "PC-Hardware & Builds",     color: 0x95a5a6 },
      { name: "🐧 Linux",            emoji: "🐧", description: "Linux-Nutzer",              color: 0xe67e22 },
    ],
  },
  languages: {
    label: "🌍 Sprachen",
    roles: [
      { name: "🇩🇪 Deutsch",         emoji: "🇩🇪", description: "Spricht Deutsch",           color: 0xf1c40f },
      { name: "🇬🇧 English",         emoji: "🇬🇧", description: "Speaks English",            color: 0x3498db },
      { name: "🇫🇷 Français",        emoji: "🇫🇷", description: "Parle français",            color: 0xe74c3c },
      { name: "🇪🇸 Español",         emoji: "🇪🇸", description: "Habla español",             color: 0xf1c40f },
      { name: "🇯🇵 日本語",           emoji: "🇯🇵", description: "日本語を話す",              color: 0xff4757 },
      { name: "🇰🇷 한국어",           emoji: "🇰🇷", description: "한국어를 합니다",           color: 0x3742fa },
      { name: "🇹🇷 Türkçe",          emoji: "🇹🇷", description: "Türkçe konuşur",           color: 0xe74c3c },
      { name: "🇷🇺 Русский",         emoji: "🇷🇺", description: "Говорит по-русски",         color: 0x3498db },
      { name: "🇵🇹 Português",       emoji: "🇵🇹", description: "Fala português",            color: 0x2ecc71 },
      { name: "🇨🇳 中文",             emoji: "🇨🇳", description: "说中文",                  color: 0xe74c3c },
    ],
  },
};

export const data = new SlashCommandBuilder()
  .setName("selfroles")
  .setDescription("Self-assignable roles system")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand((sub) =>
    sub
      .setName("setup")
      .setDescription("Set up self-roles panel and auto-create default roles if none exist")
  )
  .addSubcommand((sub) =>
    sub
      .setName("category")
      .setDescription("Add a whole category of roles at once (auto-creates all roles)")
      .addStringOption((opt) =>
        opt
          .setName("name")
          .setDescription("Which category to add?")
          .setRequired(true)
          .addChoices(
            { name: "🎮 Gaming",          value: "gaming"    },
            { name: "🎵 Musik",           value: "music"     },
            { name: "📺 Anime & Manga",   value: "anime"     },
            { name: "🎨 Farbrollen",      value: "colors"    },
            { name: "🌟 Hobbys",          value: "hobbies"   },
            { name: "🔧 Technik",         value: "tech"      },
            { name: "🌍 Sprachen",        value: "languages" }
          )
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add a single self-assignable role (creates it automatically if it doesn't exist)")
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
  if (!interaction.guild) {
    await interaction.reply({ content: "❌ Dieser Befehl kann nur in einem Server verwendet werden.", ephemeral: true });
    return;
  }
  const guild = await interaction.guild.fetch();
  await guild.roles.fetch().catch(() => null);
  await guild.channels.fetch().catch(() => null);

  if (sub === "category") {
    await interaction.deferReply({ ephemeral: true });
    const categoryKey = interaction.options.getString("name", true);
    const category = ROLE_CATEGORIES[categoryKey];
    if (!category) {
      await interaction.editReply({ content: "❌ Unbekannte Kategorie." });
      return;
    }

    const created: string[] = [];
    const skipped: string[] = [];
    const alreadyPanel: string[] = [];

    for (const def of category.roles) {
      let role = guild.roles.cache.find((r) => r.name === def.name);
      if (!role) {
        role = await guild.roles.create({
          name: def.name,
          color: def.color ?? 0x99aab5,
          reason: `Self-role Kategorie "${category.label}" — auto-created`,
        });
        created.push(def.name);
      } else {
        skipped.push(def.name);
      }

      const existing = await db
        .select()
        .from(selfRolesTable)
        .where(and(eq(selfRolesTable.guildId, guildId), eq(selfRolesTable.roleId, role.id)));

      if (existing.length > 0) {
        alreadyPanel.push(def.name);
        continue;
      }

      await db.insert(selfRolesTable).values({
        guildId,
        roleId: role.id,
        roleName: role.name,
        emoji: def.emoji,
        description: def.description,
      });
    }

    await refreshPanel(interaction, guildId, guild);

    const newToPanel = category.roles.length - alreadyPanel.length;
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(`✅ Kategorie ${category.label} hinzugefügt!`)
      .setDescription(
        `Alle Rollen der Kategorie **${category.label}** wurden verarbeitet und zum Self-Roles-Panel hinzugefügt.`
      )
      .addFields(
        {
          name: "📊 Zusammenfassung",
          value:
            `🆕 **${created.length}** neue Rollen erstellt\n` +
            `♻️ **${skipped.length}** Rollen bereits vorhanden\n` +
            `➕ **${newToPanel}** zum Panel hinzugefügt\n` +
            `⏭️ **${alreadyPanel.length}** waren bereits im Panel`,
        },
        ...(created.length > 0
          ? [{
              name: "🆕 Neu erstellte Rollen",
              value: created.map((n) => `• ${n}`).join("\n"),
            }]
          : []),
        {
          name: "🎭 Alle Rollen dieser Kategorie",
          value: category.roles.map((r) => `${r.emoji} **${r.name}** — ${r.description}`).join("\n"),
        }
      )
      .setFooter({ text: `${category.roles.length} Rollen in dieser Kategorie` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

  } else if (sub === "add") {
    await interaction.deferReply({ ephemeral: true });
    const name = interaction.options.getString("name", true);
    const emoji = interaction.options.getString("emoji") ?? undefined;
    const description = interaction.options.getString("description") ?? undefined;

    let role = guild.roles.cache.find((r) => r.name.toLowerCase() === name.toLowerCase());
    if (!role) {
      role = await guild.roles.create({ name, reason: "Self-role auto-created by bot" });
    }

    const existing = await db
      .select()
      .from(selfRolesTable)
      .where(and(eq(selfRolesTable.guildId, guildId), eq(selfRolesTable.roleId, role.id)));

    if (existing.length > 0) {
      await interaction.editReply({ content: `❌ **${name}** ist bereits eine Self-Role.` });
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
    await interaction.editReply({ content: `✅ Rolle **${role.name}** zum Self-Roles-Panel hinzugefügt.` });

  } else if (sub === "remove") {
    await interaction.deferReply({ ephemeral: true });
    const name = interaction.options.getString("name", true);

    const [found] = await db
      .select()
      .from(selfRolesTable)
      .where(and(eq(selfRolesTable.guildId, guildId), eq(selfRolesTable.roleName, name)));

    if (!found) {
      await interaction.editReply({ content: `❌ Rolle **${name}** nicht in Self-Roles gefunden.` });
      return;
    }

    await db.delete(selfRolesTable).where(eq(selfRolesTable.id, found.id));
    await refreshPanel(interaction, guildId, guild);
    await interaction.editReply({ content: `✅ Rolle **${name}** aus dem Self-Roles-Panel entfernt.` });

  } else if (sub === "setup") {
    await interaction.deferReply({ ephemeral: true });

    await db
      .insert(guildSettingsTable)
      .values({ guildId, selfRolesPanelChannelId: interaction.channelId })
      .onConflictDoUpdate({
        target: guildSettingsTable.guildId,
        set: { selfRolesPanelChannelId: interaction.channelId },
      });

    const existingRoles = await db
      .select()
      .from(selfRolesTable)
      .where(eq(selfRolesTable.guildId, guildId));

    const created: string[] = [];

    if (existingRoles.length === 0) {
      for (const def of DEFAULT_SELF_ROLES) {
        let role = guild.roles.cache.find((r) => r.name.toLowerCase() === def.name.toLowerCase());
        if (!role) {
          role = await guild.roles.create({
            name: def.name,
            reason: "Default self-role auto-created by bot",
          });
          created.push(def.name);
        }
        await db.insert(selfRolesTable).values({
          guildId,
          roleId: role.id,
          roleName: role.name,
          emoji: def.emoji,
          description: def.description,
        }).onConflictDoNothing();
      }
    } else {
      for (const entry of existingRoles) {
        const exists = guild.roles.cache.has(entry.roleId);
        if (!exists) {
          const newRole = await guild.roles.create({
            name: entry.roleName,
            reason: "Self-role re-created by bot (was deleted)",
          });
          await db
            .update(selfRolesTable)
            .set({ roleId: newRole.id })
            .where(eq(selfRolesTable.id, entry.id));
          created.push(entry.roleName);
        }
      }
    }

    await refreshPanel(interaction, guildId, guild);

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("✅ Self-Roles Panel eingerichtet!")
      .setDescription(
        `Das Self-Roles-Panel wurde in diesem Kanal erstellt.\n\n` +
        `Mitglieder können sich jetzt ihre Rollen selbst über Buttons auswählen.`
      )
      .addFields(
        ...(created.length > 0
          ? [{
              name: `🆕 ${created.length} Rollen automatisch erstellt`,
              value: created.map((n) => `• ${n}`).join("\n"),
            }]
          : []),
        {
          name: "➕ Weitere Rollen hinzufügen",
          value:
            "`/selfroles category` — Ganze Kategorie auf einmal hinzufügen\n" +
            "`/selfroles add` — Einzelne Rolle hinzufügen\n" +
            "`/selfroles remove` — Rolle entfernen",
        }
      )
      .setFooter({ text: "Das Panel aktualisiert sich automatisch bei Änderungen" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
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
    .setTitle("🎭 Wähle deine Rollen!")
    .setDescription(
      roles.length === 0
        ? "Noch keine Rollen konfiguriert. Admins können mit `/selfroles add` oder `/selfroles category` Rollen hinzufügen."
        : `Hier kannst du dir deine persönlichen Rollen aussuchen! ` +
          `Klicke auf einen Button um eine Rolle zu erhalten oder zu entfernen — du kannst mehrere wählen.\n\n` +
          roles
            .map((r) => `${r.emoji ? r.emoji + " " : ""}**<@&${r.roleId}>**${r.description ? `\n╰ ${r.description}` : ""}`)
            .join("\n\n")
    )
    .addFields({
      name: "ℹ️ So funktioniert es",
      value:
        "• Klicke auf einen Button um eine Rolle **zu erhalten**\n" +
        "• Klicke erneut um sie **zu entfernen**\n" +
        "• Du kannst beliebig viele Rollen gleichzeitig haben",
    })
    .setFooter({ text: `${roles.length} Rollen verfügbar • Rollen werden sofort vergeben oder entfernt` })
    .setTimestamp();

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
    await interaction.reply({ content: "❌ Deine Mitgliedsdaten konnten nicht geladen werden.", ephemeral: true });
    return;
  }

  const role = guild.roles.cache.get(roleId);
  if (!role) {
    await interaction.reply({ content: "❌ Diese Rolle existiert nicht mehr.", ephemeral: true });
    return;
  }

  if (member.roles.cache.has(roleId)) {
    await member.roles.remove(role);
    await interaction.reply({ content: `✅ Rolle **${role.name}** wurde entfernt.`, ephemeral: true });
  } else {
    await member.roles.add(role);
    await interaction.reply({ content: `✅ Du hast jetzt die Rolle **${role.name}**!`, ephemeral: true });
  }
}
