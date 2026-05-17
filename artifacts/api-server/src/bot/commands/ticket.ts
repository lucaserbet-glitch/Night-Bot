import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ButtonInteraction,
  StringSelectMenuInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextChannel,
} from "discord.js";
import { db } from "@workspace/db";
import { guildSettingsTable, ticketsTable, ticketCategoriesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const DEFAULT_CATEGORIES = [
  { name: "📋 General Support", emoji: "📋", description: "General questions and help" },
  { name: "🐛 Bug Report",       emoji: "🐛", description: "Report a bug or issue" },
  { name: "⚖️ Appeal",           emoji: "⚖️", description: "Ban or mute appeal" },
  { name: "💡 Other",            emoji: "💡", description: "Anything else" },
];

export const data = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("Ticket system")
  .addSubcommand((sub) =>
    sub
      .setName("setup")
      .setDescription("Set up the ticket system in this server")
      .addChannelOption((opt) =>
        opt
          .setName("log_channel")
          .setDescription("Channel for ticket logs (optional)")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("close").setDescription("Close the current ticket")
  )
  .addSubcommandGroup((group) =>
    group
      .setName("category")
      .setDescription("Manage ticket categories")
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("Add a ticket category")
          .addStringOption((opt) =>
            opt.setName("name").setDescription("Category name").setRequired(true)
          )
          .addStringOption((opt) =>
            opt.setName("emoji").setDescription("Emoji for this category").setRequired(false)
          )
          .addStringOption((opt) =>
            opt.setName("description").setDescription("Short description").setRequired(false)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("remove")
          .setDescription("Remove a ticket category")
          .addStringOption((opt) =>
            opt.setName("name").setDescription("Category name to remove").setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub.setName("list").setDescription("List all ticket categories")
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  if (group === "category") {
    await handleCategoryCommand(interaction, sub, guildId);
    return;
  }

  if (sub === "setup") {
    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild!;
    const logChannel = interaction.options.getChannel("log_channel");

    let category = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name === "🎫 Support Tickets"
    );
    if (!category) {
      category = await guild.channels.create({
        name: "🎫 Support Tickets",
        type: ChannelType.GuildCategory,
      });
    }

    const ticketChannel = await guild.channels.create({
      name: "📩・open-a-ticket",
      type: ChannelType.GuildText,
      parent: category.id,
      topic: "Click the button below to open a support ticket.",
    });

    const categories = await db
      .select()
      .from(ticketCategoriesTable)
      .where(eq(ticketCategoriesTable.guildId, guildId));

    const categoryList =
      categories.length > 0
        ? categories.map((c) => `${c.emoji ?? "🎫"} ${c.name}`).join("\n")
        : DEFAULT_CATEGORIES.map((c) => `${c.emoji} ${c.name}`).join("\n");

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("🎫 Support & Hilfe")
      .setDescription(
        `Brauchst du Hilfe oder hast du ein Anliegen? Kein Problem — unser Team ist für dich da! ` +
        `Klicke auf **"Ticket öffnen"** und wähle die passende Kategorie.\n\n` +
        `📌 **So funktioniert es:**\n` +
        `1️⃣ Klicke auf den Button unten\n` +
        `2️⃣ Wähle die passende Kategorie aus\n` +
        `3️⃣ Ein privater Kanal wird für dich erstellt\n` +
        `4️⃣ Beschreibe dein Anliegen und warte auf einen Mitarbeiter\n\n` +
        `⏱️ Wir antworten so schnell wie möglich!`
      )
      .addFields(
        { name: "📂 Verfügbare Kategorien", value: categoryList },
        { name: "⚠️ Hinweis", value: "Bitte öffne nur ein Ticket pro Anliegen. Missbrauch des Ticket-Systems kann zu Maßnahmen führen." }
      )
      .setFooter({ text: `${guild.name} • Support-Team`, iconURL: guild.iconURL() ?? undefined })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_open")
        .setLabel("Open Ticket")
        .setEmoji("🎫")
        .setStyle(ButtonStyle.Primary)
    );

    await (ticketChannel as TextChannel).send({ embeds: [embed], components: [row] });

    await db
      .insert(guildSettingsTable)
      .values({ guildId, ticketCategoryId: category.id, ticketLogChannelId: logChannel?.id ?? null })
      .onConflictDoUpdate({
        target: guildSettingsTable.guildId,
        set: { ticketCategoryId: category.id, ticketLogChannelId: logChannel?.id ?? null },
      });

    await interaction.editReply({
      content:
        `✅ Ticket system set up! Panel created in <#${ticketChannel.id}>.\n\n` +
        `Use \`/ticket category add\` to add custom categories.`,
    });
  } else if (sub === "close") {
    const channelId = interaction.channelId;
    const [ticket] = await db
      .select()
      .from(ticketsTable)
      .where(and(eq(ticketsTable.channelId, channelId), eq(ticketsTable.status, "open")));

    if (!ticket) {
      await interaction.reply({ content: "❌ This channel is not an open ticket.", ephemeral: true });
      return;
    }

    await interaction.reply({ content: "🔒 Closing ticket in 3 seconds..." });
    await db.update(ticketsTable).set({ status: "closed", closedAt: new Date() }).where(eq(ticketsTable.channelId, channelId));
    await logTicketClose(interaction, ticket.userId, ticket.category ?? "Unknown");
    setTimeout(() => interaction.channel?.delete().catch(() => null), 3000);
  }
}

async function handleCategoryCommand(
  interaction: ChatInputCommandInteraction,
  sub: string,
  guildId: string
) {
  if (sub === "add") {
    const name = interaction.options.getString("name", true);
    const emoji = interaction.options.getString("emoji") ?? null;
    const description = interaction.options.getString("description") ?? null;

    const existing = await db
      .select()
      .from(ticketCategoriesTable)
      .where(and(eq(ticketCategoriesTable.guildId, guildId), eq(ticketCategoriesTable.name, name)));

    if (existing.length > 0) {
      await interaction.reply({ content: `❌ Category **${name}** already exists.`, ephemeral: true });
      return;
    }

    const count = await db.select().from(ticketCategoriesTable).where(eq(ticketCategoriesTable.guildId, guildId));
    if (count.length >= 25) {
      await interaction.reply({ content: "❌ You can have at most 25 categories.", ephemeral: true });
      return;
    }

    await db.insert(ticketCategoriesTable).values({ guildId, name, emoji, description });
    await interaction.reply({
      content: `✅ Category **${emoji ? emoji + " " : ""}${name}** added.`,
      ephemeral: true,
    });
  } else if (sub === "remove") {
    const name = interaction.options.getString("name", true);
    const [found] = await db
      .select()
      .from(ticketCategoriesTable)
      .where(and(eq(ticketCategoriesTable.guildId, guildId), eq(ticketCategoriesTable.name, name)));

    if (!found) {
      await interaction.reply({ content: `❌ Category **${name}** not found.`, ephemeral: true });
      return;
    }

    await db.delete(ticketCategoriesTable).where(eq(ticketCategoriesTable.id, found.id));
    await interaction.reply({ content: `✅ Category **${name}** removed.`, ephemeral: true });
  } else if (sub === "list") {
    const categories = await db
      .select()
      .from(ticketCategoriesTable)
      .where(eq(ticketCategoriesTable.guildId, guildId));

    if (categories.length === 0) {
      await interaction.reply({
        content: "No custom categories set. Using defaults:\n" +
          DEFAULT_CATEGORIES.map((c) => `${c.emoji} **${c.name}** — ${c.description}`).join("\n"),
        ephemeral: true,
      });
      return;
    }

    const list = categories
      .map((c) => `${c.emoji ?? "🎫"} **${c.name}**${c.description ? ` — ${c.description}` : ""}`)
      .join("\n");

    await interaction.reply({ content: `**Ticket Categories:**\n${list}`, ephemeral: true });
  }
}

export async function handleTicketOpen(interaction: ButtonInteraction) {
  const guildId = interaction.guildId!;

  const existing = await db
    .select()
    .from(ticketsTable)
    .where(and(eq(ticketsTable.guildId, guildId), eq(ticketsTable.userId, interaction.user.id), eq(ticketsTable.status, "open")));

  if (existing.length > 0) {
    await interaction.reply({
      content: `❌ You already have an open ticket: <#${existing[0]!.channelId}>`,
      ephemeral: true,
    });
    return;
  }

  const customCategories = await db
    .select()
    .from(ticketCategoriesTable)
    .where(eq(ticketCategoriesTable.guildId, guildId));

  const categories = customCategories.length > 0 ? customCategories : DEFAULT_CATEGORIES.map((c) => ({
    id: 0, guildId, name: c.name, emoji: c.emoji, description: c.description, createdAt: new Date(),
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId("ticket_category_select")
    .setPlaceholder("Choose a ticket category...")
    .addOptions(
      categories.map((c) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(c.name)
          .setValue(c.name)
          .setDescription(c.description ?? "Open a ticket in this category")
          .setEmoji(c.emoji ?? "🎫")
      )
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  await interaction.reply({
    content: "Please select a category for your ticket:",
    components: [row],
    ephemeral: true,
  });
}

export async function handleTicketCategorySelect(interaction: StringSelectMenuInteraction) {
  await interaction.deferUpdate();
  const guild = interaction.guild!;
  const guildId = guild.id;
  const userId = interaction.user.id;
  const category = interaction.values[0]!;

  const [settings] = await db
    .select()
    .from(guildSettingsTable)
    .where(eq(guildSettingsTable.guildId, guildId));

  const safeName = category.replace(/[^\w\s-]/g, "").trim().toLowerCase().replace(/\s+/g, "-").slice(0, 20);
  const channelName = `${safeName}-${interaction.user.username.slice(0, 15)}`;

  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: settings?.ticketCategoryId ?? undefined,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      { id: interaction.client.user!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
    ],
  });

  await db.insert(ticketsTable).values({
    guildId,
    channelId: ticketChannel.id,
    userId,
    category,
    status: "open",
  });

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`🎫 Ticket — ${category}`)
    .setDescription(
      `Hallo ${interaction.user}! 👋 Danke, dass du ein Ticket eröffnet hast.\n\n` +
      `Ein Mitarbeiter wird sich so schnell wie möglich um dein Anliegen kümmern. ` +
      `**Bitte beschreibe dein Problem so detailliert wie möglich**, damit wir dir schneller helfen können.`
    )
    .addFields(
      { name: "📂 Kategorie", value: category, inline: true },
      { name: "👤 Erstellt von", value: `${interaction.user}`, inline: true },
      { name: "🕐 Erstellt am", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
      {
        name: "📝 Hilfreiche Informationen",
        value:
          "• Beschreibe dein Problem so genau wie möglich\n" +
          "• Füge Screenshots oder Beweise bei, falls vorhanden\n" +
          "• Gib an, wann das Problem aufgetreten ist\n" +
          "• Klicke auf **Ticket schließen** wenn dein Anliegen gelöst wurde",
      }
    )
    .setFooter({ text: "Unser Team ist für dich da • Bitte hab etwas Geduld" })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("Close Ticket")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger)
  );

  await (ticketChannel as TextChannel).send({ content: `${interaction.user}`, embeds: [embed], components: [row] });

  await interaction.editReply({
    content: `✅ Your **${category}** ticket has been created: <#${ticketChannel.id}>`,
    components: [],
  });
}

export async function handleTicketClose(interaction: ButtonInteraction) {
  const channelId = interaction.channelId;
  const [ticket] = await db
    .select()
    .from(ticketsTable)
    .where(and(eq(ticketsTable.channelId, channelId), eq(ticketsTable.status, "open")));

  if (!ticket) {
    await interaction.reply({ content: "❌ This is not an open ticket.", ephemeral: true });
    return;
  }

  await interaction.reply({ content: "🔒 Closing ticket in 3 seconds..." });
  await db.update(ticketsTable).set({ status: "closed", closedAt: new Date() }).where(eq(ticketsTable.channelId, channelId));
  await logTicketClose(interaction, ticket.userId, ticket.category ?? "Unknown");
  setTimeout(() => interaction.channel?.delete().catch(() => null), 3000);
}

async function logTicketClose(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  ticketUserId: string,
  category: string
) {
  const guildId = interaction.guildId!;
  const [settings] = await db
    .select()
    .from(guildSettingsTable)
    .where(eq(guildSettingsTable.guildId, guildId));

  if (!settings?.ticketLogChannelId) return;
  const logChannel = interaction.guild!.channels.cache.get(settings.ticketLogChannelId);
  if (!logChannel?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("🔒 Ticket Closed")
    .addFields(
      { name: "Category", value: category, inline: true },
      { name: "Opened by", value: `<@${ticketUserId}>`, inline: true },
      { name: "Closed by", value: `${interaction.user}`, inline: true }
    )
    .setTimestamp();

  await (logChannel as TextChannel).send({ embeds: [embed] }).catch(() => null);
}
