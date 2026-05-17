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
  ColorResolvable,
} from "discord.js";
import { db } from "@workspace/db";
import { guildSettingsTable, selfRolesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

// ─── Colour helper ────────────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, ColorResolvable> = {
  "🎮 Gaming":            0x1abc9c,
  "🎵 Musik":             0xf1c40f,
  "📺 Anime & Manga":     0xff6b9d,
  "🎨 Farbrollen":        0x3498db,
  "🌟 Hobbys":            0xe67e22,
  "🔧 Technik":           0x2980b9,
  "🌍 Sprachen":          0x27ae60,
  "🗺️ Bundesländer":      0x2c3e50,
  "⚧️ Geschlechter":      0x9b59b6,
  "🌈 Sexualitäten":      0xe74c3c,
  "Allgemein":            0x99aab5,
};

type RoleDef = { name: string; emoji: string; description: string; color?: number };

// ─── All predefined role-category presets ────────────────────────────────────
const ROLE_CATEGORIES: Record<string, { label: string; roles: RoleDef[] }> = {
  gaming: {
    label: "🎮 Gaming",
    roles: [
      { name: "🎮 Gamer",          emoji: "🎮", description: "Allgemeines Gaming",        color: 0x1abc9c },
      { name: "⚔️ RPG",             emoji: "⚔️",  description: "Rollenspiele",              color: 0xe74c3c },
      { name: "🔫 Shooter",         emoji: "🔫", description: "Ego-/Third-Person Shooter",  color: 0x95a5a6 },
      { name: "⚽ Sports Games",    emoji: "⚽", description: "Sportspiele",                color: 0x2ecc71 },
      { name: "🧠 Strategy",        emoji: "🧠", description: "Strategie & Aufbau",         color: 0x9b59b6 },
      { name: "🃏 Card Games",      emoji: "🃏", description: "Kartenspiele",               color: 0xf1c40f },
      { name: "🏎️ Racing",          emoji: "🏎️", description: "Rennspiele",                color: 0xe67e22 },
      { name: "🌍 Open World",      emoji: "🌍", description: "Open World Spiele",          color: 0x27ae60 },
      { name: "👾 Retro Gaming",    emoji: "👾", description: "Klassische Spiele",          color: 0x8e44ad },
      { name: "📱 Mobile Gaming",   emoji: "📱", description: "Mobile Games",               color: 0x3498db },
    ],
  },
  music: {
    label: "🎵 Musik",
    roles: [
      { name: "🎵 Music Fan",       emoji: "🎵", description: "Genereller Musikfan",        color: 0xf1c40f },
      { name: "🎸 Rock",            emoji: "🎸", description: "Rock & Metal",               color: 0xe74c3c },
      { name: "🎤 Pop",             emoji: "🎤", description: "Pop-Musik",                  color: 0xff69b4 },
      { name: "🎧 Hip-Hop",         emoji: "🎧", description: "Hip-Hop & Rap",              color: 0x2c3e50 },
      { name: "🎹 Electronic",      emoji: "🎹", description: "EDM / Electronic",           color: 0x9b59b6 },
      { name: "🎺 Jazz & Blues",    emoji: "🎺", description: "Jazz und Blues",             color: 0xe67e22 },
      { name: "🎻 Classical",       emoji: "🎻", description: "Klassische Musik",           color: 0xbdc3c7 },
      { name: "🌴 R&B",             emoji: "🌴", description: "R&B & Soul",                color: 0x8e44ad },
      { name: "🤠 Country",         emoji: "🤠", description: "Country-Musik",              color: 0xd4a017 },
      { name: "🎙️ K-Pop",           emoji: "🎙️", description: "K-Pop & J-Pop",             color: 0xff1493 },
    ],
  },
  anime: {
    label: "📺 Anime & Manga",
    roles: [
      { name: "📺 Anime Fan",       emoji: "📺", description: "Allgemeiner Anime-Fan",      color: 0xff6b9d },
      { name: "⚔️ Shōnen",          emoji: "⚔️",  description: "Action-Anime",              color: 0xe74c3c },
      { name: "💕 Shōjo",           emoji: "💕", description: "Romantik-Anime",             color: 0xff69b4 },
      { name: "🧬 Sci-Fi Anime",    emoji: "🧬", description: "Science-Fiction Anime",     color: 0x3498db },
      { name: "😂 Comedy Anime",    emoji: "😂", description: "Komödie Anime",             color: 0xf1c40f },
      { name: "📖 Manga Reader",    emoji: "📖", description: "Liest Manga",               color: 0x9b59b6 },
      { name: "🎌 Japankultur",     emoji: "🎌", description: "Interesse an Japankultur",  color: 0xe74c3c },
      { name: "🎮 Gacha Games",     emoji: "🎮", description: "Gacha & Anime-Spiele",      color: 0x1abc9c },
    ],
  },
  colors: {
    label: "🎨 Farbrollen",
    roles: [
      { name: "❤️ Rot",             emoji: "❤️", description: "Farbrolle Rot",              color: 0xe74c3c },
      { name: "🧡 Orange",          emoji: "🧡", description: "Farbrolle Orange",           color: 0xe67e22 },
      { name: "💛 Gelb",            emoji: "💛", description: "Farbrolle Gelb",             color: 0xf1c40f },
      { name: "💚 Grün",            emoji: "💚", description: "Farbrolle Grün",             color: 0x2ecc71 },
      { name: "💙 Blau",            emoji: "💙", description: "Farbrolle Blau",             color: 0x3498db },
      { name: "💜 Lila",            emoji: "💜", description: "Farbrolle Lila",             color: 0x9b59b6 },
      { name: "🩷 Pink",            emoji: "🩷", description: "Farbrolle Pink",             color: 0xff69b4 },
      { name: "🖤 Schwarz",         emoji: "🖤", description: "Farbrolle Schwarz",          color: 0x2c3e50 },
      { name: "🤍 Weiß",            emoji: "🤍", description: "Farbrolle Weiß",            color: 0xecf0f1 },
      { name: "🩶 Grau",            emoji: "🩶", description: "Farbrolle Grau",             color: 0x95a5a6 },
    ],
  },
  hobbies: {
    label: "🌟 Hobbys",
    roles: [
      { name: "📸 Photography",     emoji: "📸", description: "Fotografie",                 color: 0x2c3e50 },
      { name: "🎨 Art & Drawing",   emoji: "🎨", description: "Zeichnen & Kunst",           color: 0xe74c3c },
      { name: "📚 Leser",           emoji: "📚", description: "Liest gerne Bücher",         color: 0x8e44ad },
      { name: "🍳 Kochen",          emoji: "🍳", description: "Kocht gerne",                color: 0xe67e22 },
      { name: "🏋️ Sport & Fitness", emoji: "🏋️", description: "Sport & Fitness",           color: 0x27ae60 },
      { name: "✈️ Reisen",           emoji: "✈️", description: "Reisebegeistert",            color: 0x3498db },
      { name: "🎭 Theater & Film",  emoji: "🎭", description: "Film & Serien",              color: 0x9b59b6 },
      { name: "🐾 Tierliebhaber",   emoji: "🐾", description: "Mag Tiere",                  color: 0xd4a017 },
      { name: "🌿 Natur & Wandern", emoji: "🌿", description: "In der Natur unterwegs",    color: 0x2ecc71 },
      { name: "🎲 Brettspiele",     emoji: "🎲", description: "Brettspiele & Tabletop",    color: 0x1abc9c },
    ],
  },
  tech: {
    label: "🔧 Technik",
    roles: [
      { name: "💻 Programmer",      emoji: "💻", description: "Programmiert gerne",         color: 0x3498db },
      { name: "🎨 Designer",        emoji: "🎨", description: "Grafik & UI-Design",         color: 0xff69b4 },
      { name: "🔒 Cybersecurity",   emoji: "🔒", description: "IT-Sicherheit",              color: 0xe74c3c },
      { name: "🤖 AI & ML",         emoji: "🤖", description: "Künstliche Intelligenz",    color: 0x9b59b6 },
      { name: "🌐 Web Dev",         emoji: "🌐", description: "Webentwicklung",             color: 0x1abc9c },
      { name: "📱 Mobile Dev",      emoji: "📱", description: "App-Entwicklung",            color: 0x2ecc71 },
      { name: "🖥️ Hardware",        emoji: "🖥️", description: "PC-Hardware & Builds",      color: 0x95a5a6 },
      { name: "🐧 Linux",           emoji: "🐧", description: "Linux-Nutzer",               color: 0xe67e22 },
    ],
  },
  languages: {
    label: "🌍 Sprachen",
    roles: [
      { name: "🇩🇪 Deutsch",        emoji: "🇩🇪", description: "Spricht Deutsch",            color: 0xf1c40f },
      { name: "🇬🇧 English",        emoji: "🇬🇧", description: "Speaks English",             color: 0x3498db },
      { name: "🇫🇷 Français",       emoji: "🇫🇷", description: "Parle français",             color: 0xe74c3c },
      { name: "🇪🇸 Español",        emoji: "🇪🇸", description: "Habla español",              color: 0xf1c40f },
      { name: "🇯🇵 日本語",          emoji: "🇯🇵", description: "日本語を話す",               color: 0xff4757 },
      { name: "🇰🇷 한국어",          emoji: "🇰🇷", description: "한국어를 합니다",            color: 0x3742fa },
      { name: "🇹🇷 Türkçe",         emoji: "🇹🇷", description: "Türkçe konuşur",            color: 0xe74c3c },
      { name: "🇷🇺 Русский",        emoji: "🇷🇺", description: "Говорит по-русски",          color: 0x3498db },
      { name: "🇵🇹 Português",      emoji: "🇵🇹", description: "Fala português",             color: 0x2ecc71 },
      { name: "🇨🇳 中文",            emoji: "🇨🇳", description: "说中文",                   color: 0xe74c3c },
    ],
  },
  bundeslaender: {
    label: "🗺️ Bundesländer",
    roles: [
      { name: "🐻 Baden-Württemberg",       emoji: "🐻", description: "Aus Baden-Württemberg",       color: 0xf1c40f },
      { name: "🦁 Bayern",                  emoji: "🦁", description: "Aus Bayern",                  color: 0x3498db },
      { name: "🐻‍❄️ Berlin",               emoji: "🐻‍❄️", description: "Aus Berlin",              color: 0xe74c3c },
      { name: "🦅 Brandenburg",             emoji: "🦅", description: "Aus Brandenburg",             color: 0xe74c3c },
      { name: "🗝️ Bremen",                  emoji: "🗝️", description: "Aus Bremen",                 color: 0xf1c40f },
      { name: "⚓ Hamburg",                 emoji: "⚓", description: "Aus Hamburg",                 color: 0xe74c3c },
      { name: "🦁 Hessen",                  emoji: "🦁", description: "Aus Hessen",                  color: 0xe74c3c },
      { name: "🐂 Mecklenburg-Vorpommern",  emoji: "🐂", description: "Aus Mecklenburg-Vorpommern",  color: 0x3498db },
      { name: "🐴 Niedersachsen",           emoji: "🐴", description: "Aus Niedersachsen",           color: 0xf1c40f },
      { name: "🐴 Nordrhein-Westfalen",     emoji: "🐴", description: "Aus Nordrhein-Westfalen",     color: 0x2ecc71 },
      { name: "🦅 Rheinland-Pfalz",         emoji: "🦅", description: "Aus Rheinland-Pfalz",         color: 0x2c3e50 },
      { name: "⚙️ Saarland",               emoji: "⚙️", description: "Aus dem Saarland",            color: 0x3498db },
      { name: "🦌 Sachsen",                 emoji: "🦌", description: "Aus Sachsen",                 color: 0x27ae60 },
      { name: "🦅 Sachsen-Anhalt",          emoji: "🦅", description: "Aus Sachsen-Anhalt",          color: 0xf1c40f },
      { name: "🦢 Schleswig-Holstein",      emoji: "🦢", description: "Aus Schleswig-Holstein",      color: 0x3498db },
      { name: "🌲 Thüringen",               emoji: "🌲", description: "Aus Thüringen",               color: 0xe74c3c },
    ],
  },
  genders: {
    label: "⚧️ Geschlechter",
    roles: [
      { name: "♂️ Mann",            emoji: "♂️", description: "Männlich",                   color: 0x3498db },
      { name: "♀️ Frau",            emoji: "♀️", description: "Weiblich",                   color: 0xff69b4 },
      { name: "⚧️ Nicht-binär",     emoji: "⚧️", description: "Nicht-binär",               color: 0x9b59b6 },
      { name: "🌊 Genderfluid",     emoji: "🌊", description: "Genderfluid",                color: 0x9b59b6 },
      { name: "🌫️ Agender",         emoji: "🌫️", description: "Ohne Geschlecht",            color: 0x95a5a6 },
      { name: "🏳️‍⚧️ Transgender",   emoji: "🏳️‍⚧️", description: "Transgender",           color: 0x5bcefa },
      { name: "💫 Bigender",        emoji: "💫", description: "Bigender",                   color: 0xc779d0 },
      { name: "❓ Questioning",     emoji: "❓", description: "Noch auf der Suche",         color: 0xf1c40f },
    ],
  },
  sexualities: {
    label: "🌈 Sexualitäten",
    roles: [
      { name: "🏳️‍🌈 Queer",         emoji: "🏳️‍🌈", description: "Queer",                 color: 0xe74c3c },
      { name: "💙 Heterosexuell",   emoji: "💙", description: "Heterosexuell",              color: 0x3498db },
      { name: "💛 Gay",             emoji: "💛", description: "Homosexuell (schwul)",        color: 0xf1c40f },
      { name: "🌹 Lesbian",         emoji: "🌹", description: "Homosexuell (lesbisch)",      color: 0xa50062 },
      { name: "💗 Bisexuell",       emoji: "💗", description: "Bisexuell",                  color: 0xd60270 },
      { name: "💛 Pansexuell",      emoji: "💛", description: "Pansexuell",                 color: 0xff1b8d },
      { name: "🖤 Asexuell",        emoji: "🖤", description: "Asexuell / Ace",             color: 0x2c3e50 },
      { name: "🖤 Aromantisch",     emoji: "🖤", description: "Aromantisch / Aro",          color: 0x3d9970 },
      { name: "🤍 Demisexuell",     emoji: "🤍", description: "Demisexuell",                color: 0x95a5a6 },
    ],
  },
};

const DEFAULT_SELF_ROLES: (RoleDef & { category: string })[] = [
  { name: "🎮 Gamer",       emoji: "🎮", description: "Into gaming",     category: "🎮 Gaming"   },
  { name: "🎵 Music Fan",   emoji: "🎵", description: "Loves music",     category: "🎵 Musik"    },
  { name: "🎨 Artist",      emoji: "🎨", description: "Creative mind",   category: "🌟 Hobbys"   },
  { name: "📺 Anime Fan",   emoji: "📺", description: "Watches anime",   category: "📺 Anime & Manga" },
  { name: "🔧 Tech Nerd",   emoji: "🔧", description: "Loves technology",category: "🔧 Technik"  },
  { name: "📸 Photography", emoji: "📸", description: "Captures moments",category: "🌟 Hobbys"   },
];

// ─── Slash command definition ─────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName("selfroles")
  .setDescription("Self-assignable roles system")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand((sub) =>
    sub
      .setName("setup")
      .setDescription("Create the self-roles panel in this channel (auto-creates default roles if none exist)")
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
            { name: "🎮 Gaming",           value: "gaming"        },
            { name: "🎵 Musik",            value: "music"         },
            { name: "📺 Anime & Manga",    value: "anime"         },
            { name: "🎨 Farbrollen",       value: "colors"        },
            { name: "🌟 Hobbys",           value: "hobbies"       },
            { name: "🔧 Technik",          value: "tech"          },
            { name: "🌍 Sprachen",         value: "languages"     },
            { name: "🗺️ Bundesländer",     value: "bundeslaender" },
            { name: "⚧️ Geschlechter",     value: "genders"       },
            { name: "🌈 Sexualitäten",     value: "sexualities"   }
          )
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add a single self-assignable role")
      .addStringOption((opt) =>
        opt.setName("name").setDescription("Role name").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("category").setDescription('Category label (e.g. "🎮 Gaming")').setRequired(false)
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
      .setDescription("Remove a self-assignable role from the panel")
      .addStringOption((opt) =>
        opt.setName("name").setDescription("Role name to remove").setRequired(true)
      )
  );

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ Dieser Befehl kann nur in einem Server verwendet werden.", ephemeral: true });
    return;
  }
  const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    await interaction.reply({ content: "❌ Server konnte nicht geladen werden.", ephemeral: true });
    return;
  }
  await guild.roles.fetch().catch(() => null);
  await guild.channels.fetch().catch(() => null);

  // ── /selfroles category ────────────────────────────────────────────────────
  if (sub === "category") {
    await interaction.deferReply({ ephemeral: true });
    const categoryKey = interaction.options.getString("name", true);
    const preset = ROLE_CATEGORIES[categoryKey];
    if (!preset) {
      await interaction.editReply({ content: "❌ Unbekannte Kategorie." });
      return;
    }

    const created: string[] = [];
    const skipped: string[] = [];
    const alreadyPanel: string[] = [];

    for (const def of preset.roles) {
      let role = guild.roles.cache.find((r) => r.name === def.name);
      if (!role) {
        role = await guild.roles.create({
          name: def.name,
          color: def.color ?? 0x99aab5,
          reason: `Self-role Kategorie "${preset.label}" — auto-created`,
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
        category: preset.label,
      });
    }

    await refreshPanel(interaction.client, guildId, guild);

    const newToPanel = preset.roles.length - alreadyPanel.length;
    const embed = new EmbedBuilder()
      .setColor(CATEGORY_COLORS[preset.label] ?? 0x2ecc71)
      .setTitle(`✅ Kategorie ${preset.label} hinzugefügt!`)
      .setDescription(
        `Alle Rollen der Kategorie **${preset.label}** wurden verarbeitet und dem Self-Roles-Panel hinzugefügt.`
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
          ? [{ name: "🆕 Neu erstellte Rollen", value: created.map((n) => `• ${n}`).join("\n") }]
          : []),
        {
          name: "🎭 Rollen dieser Kategorie",
          value: preset.roles.map((r) => `${r.emoji} **${r.name}** — ${r.description}`).join("\n"),
        }
      )
      .setFooter({ text: `${preset.roles.length} Rollen in dieser Kategorie` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

  // ── /selfroles add ─────────────────────────────────────────────────────────
  } else if (sub === "add") {
    await interaction.deferReply({ ephemeral: true });
    const name        = interaction.options.getString("name", true);
    const category    = interaction.options.getString("category") ?? "Allgemein";
    const emoji       = interaction.options.getString("emoji") ?? undefined;
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
      category,
    });

    await refreshPanel(interaction.client, guildId, guild);
    await interaction.editReply({
      content: `✅ Rolle **${role.name}** zur Kategorie **${category}** im Panel hinzugefügt.`,
    });

  // ── /selfroles remove ──────────────────────────────────────────────────────
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
    await refreshPanel(interaction.client, guildId, guild);
    await interaction.editReply({ content: `✅ Rolle **${name}** aus dem Panel entfernt.` });

  // ── /selfroles setup ───────────────────────────────────────────────────────
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
          role = await guild.roles.create({ name: def.name, reason: "Default self-role auto-created" });
          created.push(def.name);
        }
        await db.insert(selfRolesTable).values({
          guildId,
          roleId: role.id,
          roleName: role.name,
          emoji: def.emoji,
          description: def.description,
          category: def.category,
        }).onConflictDoNothing();
      }
    } else {
      for (const entry of existingRoles) {
        if (!guild.roles.cache.has(entry.roleId)) {
          const newRole = await guild.roles.create({
            name: entry.roleName,
            reason: "Self-role re-created by bot (was deleted)",
          });
          await db.update(selfRolesTable).set({ roleId: newRole.id }).where(eq(selfRolesTable.id, entry.id));
          created.push(entry.roleName);
        }
      }
    }

    await refreshPanel(interaction.client, guildId, guild);

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("✅ Self-Roles Panel eingerichtet!")
      .setDescription(
        `Das Self-Roles-Panel wurde in diesem Kanal erstellt.\n\n` +
        `Jede Rollen-Kategorie hat ihr eigenes Panel mit Buttons. ` +
        `Mitglieder können mehrere Rollen aus mehreren Kategorien gleichzeitig wählen.`
      )
      .addFields(
        ...(created.length > 0
          ? [{ name: `🆕 ${created.length} Rollen automatisch erstellt`, value: created.map((n) => `• ${n}`).join("\n") }]
          : []),
        {
          name: "➕ Weitere Rollen hinzufügen",
          value:
            "`/selfroles category` — Ganze Kategorie hinzufügen\n" +
            "`/selfroles add` — Einzelne Rolle hinzufügen\n" +
            "`/selfroles remove` — Rolle entfernen",
        }
      )
      .setFooter({ text: "Das Panel aktualisiert sich automatisch bei Änderungen" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
}

// ─── Panel refresh — one message per category ─────────────────────────────────
async function refreshPanel(
  client: import("discord.js").Client,
  guildId: string,
  guild: import("discord.js").Guild
) {
  const [settings] = await db
    .select()
    .from(guildSettingsTable)
    .where(eq(guildSettingsTable.guildId, guildId));

  if (!settings?.selfRolesPanelChannelId) return;

  const channel = guild.channels.cache.get(settings.selfRolesPanelChannelId) as TextChannel | undefined;
  if (!channel) return;

  // Parse stored message IDs: { "categoryLabel": "messageId" }
  let storedIds: Record<string, string> = {};
  try {
    storedIds = settings.selfRolesPanelMessageIds
      ? (JSON.parse(settings.selfRolesPanelMessageIds) as Record<string, string>)
      : {};
  } catch {
    storedIds = {};
  }

  // Also delete the old single-panel message if present
  if (settings.selfRolesPanelMessageId && !storedIds["__legacy__"]) {
    const old = await channel.messages.fetch(settings.selfRolesPanelMessageId).catch(() => null);
    if (old) await old.delete().catch(() => null);
    await db
      .update(guildSettingsTable)
      .set({ selfRolesPanelMessageId: null })
      .where(eq(guildSettingsTable.guildId, guildId));
  }

  const allRoles = await db
    .select()
    .from(selfRolesTable)
    .where(eq(selfRolesTable.guildId, guildId));

  // Group roles by category
  const byCategory = new Map<string, typeof allRoles>();
  for (const r of allRoles) {
    const cat = r.category ?? "Allgemein";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(r);
  }

  const newIds: Record<string, string> = {};

  // Delete messages for categories that no longer have roles
  for (const [cat, msgId] of Object.entries(storedIds)) {
    if (!byCategory.has(cat)) {
      const old = await channel.messages.fetch(msgId).catch(() => null);
      if (old) await old.delete().catch(() => null);
    }
  }

  // Create or update one message per category
  for (const [cat, roles] of byCategory) {
    const color: ColorResolvable = CATEGORY_COLORS[cat] ?? 0x99aab5;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(cat)
      .setDescription(
        `Klicke auf einen Button um eine Rolle zu **erhalten** oder zu **entfernen**.\n\n` +
        roles.map((r) =>
          `${r.emoji ? r.emoji + " " : ""}**<@&${r.roleId}>**${r.description ? `\n╰ ${r.description}` : ""}`
        ).join("\n\n")
      )
      .setFooter({ text: `${roles.length} Rolle${roles.length === 1 ? "" : "n"} • Klick = Rolle an/aus` });

    // Build button rows (max 5 rows × 5 buttons = 25)
    const components: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < Math.min(roles.length, 25); i += 5) {
      const row = new ActionRowBuilder<ButtonBuilder>();
      for (const r of roles.slice(i, i + 5)) {
        const btn = new ButtonBuilder()
          .setCustomId(`selfrole_toggle_${r.roleId}`)
          .setLabel(r.roleName)
          .setStyle(ButtonStyle.Secondary);
        if (r.emoji) btn.setEmoji(r.emoji);
        row.addComponents(btn);
      }
      components.push(row);
    }

    const existingMsgId = storedIds[cat];
    if (existingMsgId) {
      const existing = await channel.messages.fetch(existingMsgId).catch(() => null);
      if (existing) {
        await existing.edit({ embeds: [embed], components }).catch(() => null);
        newIds[cat] = existing.id;
        continue;
      }
    }
    // Send new message for this category
    const msg = await channel.send({ embeds: [embed], components });
    newIds[cat] = msg.id;
  }

  // Persist updated message ID map
  await db
    .update(guildSettingsTable)
    .set({ selfRolesPanelMessageIds: JSON.stringify(newIds) })
    .where(eq(guildSettingsTable.guildId, guildId));
}

// ─── Button toggle handler ────────────────────────────────────────────────────
export async function handleSelfroleToggle(interaction: ButtonInteraction, roleId: string) {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ Dieser Befehl kann nur in einem Server verwendet werden.", ephemeral: true });
    return;
  }
  const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    await interaction.reply({ content: "❌ Server konnte nicht geladen werden.", ephemeral: true });
    return;
  }
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: "❌ Deine Mitgliedsdaten konnten nicht geladen werden.", ephemeral: true });
    return;
  }

  const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) {
    await interaction.reply({ content: "❌ Diese Rolle existiert nicht mehr.", ephemeral: true });
    return;
  }

  if (member.roles.cache.has(roleId)) {
    await member.roles.remove(role);
    await interaction.reply({ content: `✅ Rolle **${role.name}** wurde entfernt.`, ephemeral: true });
  } else {
    await member.roles.add(role);
    await interaction.reply({ content: `✅ Du hast jetzt die Rolle **${role.name}**! 🎉`, ephemeral: true });
  }
}
