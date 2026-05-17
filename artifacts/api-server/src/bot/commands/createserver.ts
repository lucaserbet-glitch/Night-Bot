import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  ColorResolvable,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("serversetup")
  .setDescription("Set up this server with a full template (creates categories, channels & roles)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((opt) =>
    opt
      .setName("template")
      .setDescription("Server template to apply")
      .setRequired(true)
      .addChoices(
        { name: "🌐 Community Server", value: "community" },
        { name: "🎮 Gaming Server",    value: "gaming"    },
        { name: "💼 Business Server",  value: "business"  }
      )
  );

type ChildChannel = { name: string; type: ChannelType.GuildText | ChannelType.GuildVoice; topic?: string };
type CategoryEntry = { name: string; children: ChildChannel[] };
type RoleEntry     = { name: string; color: number; hoist?: boolean };

// Strips everything except lowercase letters, numbers and hyphens — used for
// channel-name comparisons because Discord normalises names on creation.
function normaliseName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9-]/g, "");
}

// Small delay to stay well under Discord's rate-limit (5 req / 5 s per route)
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTemplate(template: string): { categories: CategoryEntry[]; roles: RoleEntry[] } {
  const commonCategories: CategoryEntry[] = [
    {
      name: "📢 Information",
      children: [
        { name: "📋・rules",         type: ChannelType.GuildText,  topic: "Server rules" },
        { name: "📣・announcements", type: ChannelType.GuildText,  topic: "Server announcements" },
        { name: "🎭・roles",         type: ChannelType.GuildText,  topic: "Get your roles here" },
        { name: "🎉・welcome",       type: ChannelType.GuildText,  topic: "Welcome new members" },
      ],
    },
    {
      name: "💬 General",
      children: [
        { name: "💬・general",       type: ChannelType.GuildText,  topic: "General chat" },
        { name: "🤖・bot-commands",  type: ChannelType.GuildText,  topic: "Use bot commands here" },
        { name: "🖼️・media",         type: ChannelType.GuildText,  topic: "Share images and videos" },
        { name: "general-voice",     type: ChannelType.GuildVoice },
      ],
    },
    {
      name: "🎫 Support",
      children: [
        { name: "📩・open-a-ticket", type: ChannelType.GuildText, topic: "Open a support ticket" },
        { name: "✅・verify",        type: ChannelType.GuildText, topic: "Verify yourself here" },
      ],
    },
  ];

  const commonRoles: RoleEntry[] = [
    { name: "👑 Owner",      color: 0xf1c40f, hoist: true  },
    { name: "⚙️ Admin",      color: 0xe74c3c, hoist: true  },
    { name: "🛡️ Moderator",  color: 0x3498db, hoist: true  },
    { name: "⭐ VIP",         color: 0x9b59b6, hoist: true  },
    { name: "✅ Member",      color: 0x2ecc71, hoist: false },
    { name: "🔒 Unverified", color: 0x95a5a6, hoist: false },
  ];

  if (template === "gaming") {
    commonCategories.push({
      name: "🎮 Gaming",
      children: [
        { name: "🎮・gaming-chat",       type: ChannelType.GuildText,  topic: "Talk about games" },
        { name: "🏆・clips-highlights",  type: ChannelType.GuildText,  topic: "Share your best moments" },
        { name: "🔍・looking-for-group", type: ChannelType.GuildText,  topic: "Find teammates" },
        { name: "gaming-voice",          type: ChannelType.GuildVoice },
      ],
    });
    commonRoles.push(
      { name: "🎮 Gamer", color: 0x1abc9c, hoist: false },
      { name: "🏆 Pro",   color: 0xe67e22, hoist: true  },
    );
  } else if (template === "business") {
    commonCategories.push({
      name: "💼 Work",
      children: [
        { name: "📊・projects",  type: ChannelType.GuildText, topic: "Project discussions" },
        { name: "💡・ideas",     type: ChannelType.GuildText, topic: "Share your ideas" },
        { name: "📁・resources", type: ChannelType.GuildText, topic: "Useful resources and links" },
        { name: "meetings",      type: ChannelType.GuildVoice },
      ],
    });
    commonRoles.push(
      { name: "💼 Staff",   color: 0x1abc9c, hoist: false },
      { name: "🤝 Partner", color: 0xe67e22, hoist: true  },
    );
  } else {
    commonCategories.push({
      name: "🎨 Community",
      children: [
        { name: "🎨・creative",  type: ChannelType.GuildText, topic: "Share your creations" },
        { name: "🎵・music",     type: ChannelType.GuildText, topic: "Music discussion" },
        { name: "🎲・off-topic", type: ChannelType.GuildText, topic: "Random chat" },
        { name: "lounge",        type: ChannelType.GuildVoice },
      ],
    });
  }

  return { categories: commonCategories, roles: commonRoles };
}

const TEMPLATE_COLORS: Record<string, ColorResolvable> = {
  community: 0x3498db,
  gaming:    0x2ecc71,
  business:  0x9b59b6,
};

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.editReply({ content: "❌ Dieser Befehl kann nur in einem Server verwendet werden." });
    return;
  }

  const template = interaction.options.getString("template", true);
  const guild    = await interaction.client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    await interaction.editReply({ content: "❌ Server-Daten konnten nicht geladen werden. Bitte versuche es erneut." });
    return;
  }

  // Fetch full caches before checking what already exists
  await guild.roles.fetch().catch(() => null);
  await guild.channels.fetch().catch(() => null);

  const { categories, roles } = getTemplate(template);
  const created = { categories: 0, channels: 0, roles: 0 };
  const skipped = { categories: 0, channels: 0, roles: 0 };
  const errors:  string[] = [];

  await interaction.editReply({ content: "⏳ Richte den Server ein… das kann einen Moment dauern." });

  // ── Roles ─────────────────────────────────────────────────────────────────
  for (const roleDef of roles) {
    const exists = guild.roles.cache.find(
      (r) => r.name.toLowerCase() === roleDef.name.toLowerCase()
    );
    if (exists) {
      skipped.roles++;
      continue;
    }
    const newRole = await guild.roles.create({
      name:   roleDef.name,
      color:  roleDef.color,
      hoist:  roleDef.hoist ?? false,
      reason: `serversetup — ${template} template`,
    }).catch((err: Error) => { errors.push(`Rolle "${roleDef.name}": ${err.message}`); return null; });
    if (newRole) created.roles++;
    await sleep(300); // stay under rate limit
  }

  // ── Categories + Channels ─────────────────────────────────────────────────
  for (const cat of categories) {
    // Compare with normalised names on both sides
    const existingCat = guild.channels.cache.find(
      (c) =>
        c.type === ChannelType.GuildCategory &&
        normaliseName(c.name) === normaliseName(cat.name)
    );

    let catId: string;
    if (existingCat) {
      catId = existingCat.id;
      skipped.categories++;
    } else {
      const newCat = await guild.channels.create({
        name:   cat.name,
        type:   ChannelType.GuildCategory,
        reason: `serversetup — ${template} template`,
      }).catch((err: Error) => { errors.push(`Kategorie "${cat.name}": ${err.message}`); return null; });
      if (!newCat) continue; // skip children if category creation failed
      catId = newCat.id;
      created.categories++;
      await sleep(300);
    }

    for (const ch of cat.children) {
      // Normalise both sides so emoji/special-char differences don't matter
      const alreadyExists = guild.channels.cache.find(
        (c) => normaliseName(c.name) === normaliseName(ch.name)
      );
      if (alreadyExists) {
        skipped.channels++;
        continue;
      }
      const newCh = await guild.channels.create({
        name:   ch.name,
        type:   ch.type,
        parent: catId,
        ...(ch.type === ChannelType.GuildText && ch.topic ? { topic: ch.topic } : {}),
        reason: `serversetup — ${template} template`,
      }).catch((err: Error) => { errors.push(`Kanal "${ch.name}": ${err.message}`); return null; });
      if (newCh) created.channels++;
      await sleep(300);
    }
  }

  const templateLabel =
    template === "gaming"   ? "🎮 Gaming"    :
    template === "business" ? "💼 Business"  : "🌐 Community";

  const embed = new EmbedBuilder()
    .setColor(TEMPLATE_COLORS[template] ?? 0x3498db)
    .setTitle("✅ Server Setup abgeschlossen!")
    .setDescription(
      `**${guild.name}** wurde erfolgreich mit dem **${templateLabel}**-Template eingerichtet!\n\n` +
      `Alle Kanäle und Rollen wurden erstellt. Du kannst jetzt die Bot-Befehle verwenden ` +
      `um Willkommensnachrichten, Ticket-System, Verify-System und mehr einzurichten.`
    )
    .addFields(
      {
        name: "✅ Erstellt",
        value:
          `📁 **${created.categories}** Kategorien\n` +
          `💬 **${created.channels}** Kanäle\n` +
          `🎭 **${created.roles}** Rollen`,
        inline: true,
      },
      {
        name: "⏭️ Übersprungen",
        value:
          `📁 **${skipped.categories}** Kategorien\n` +
          `💬 **${skipped.channels}** Kanäle\n` +
          `🎭 **${skipped.roles}** Rollen`,
        inline: true,
      },
      {
        name: "🚀 Nächste Schritte",
        value:
          "`/welcome setup` — Willkommensnachricht einrichten\n" +
          "`/ticket setup` — Ticket-System aktivieren\n" +
          "`/verify setup` — Verifizierung aktivieren\n" +
          "`/selfroles setup` — Self-Roles Panel erstellen\n" +
          "`/rules set` & `/rules show` — Regeln posten\n" +
          "`/levelsetup` — Level-Rollen erstellen",
      },
      ...(errors.length > 0
        ? [{
            name: `⚠️ ${errors.length} Fehler aufgetreten`,
            value: errors.slice(0, 5).join("\n") + (errors.length > 5 ? `\n…und ${errors.length - 5} weitere` : ""),
          }]
        : [])
    )
    .setThumbnail(guild.iconURL() ?? null)
    .setFooter({
      text: `${guild.name} • serversetup • ${new Date().toLocaleDateString("de-DE")}`,
      iconURL: guild.iconURL() ?? undefined,
    })
    .setTimestamp();

  await interaction.editReply({ content: "", embeds: [embed] });
}
