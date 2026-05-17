import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  OverwriteType,
  ButtonInteraction,
  TextChannel,
} from "discord.js";
import { db } from "@workspace/db";
import { guildSettingsTable, ticketsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

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
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "setup") {
    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild!;
    const guildId = guild.id;
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

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("🎫 Support Tickets")
      .setDescription(
        "Need help? Click the button below to create a private support ticket.\nA staff member will assist you as soon as possible."
      )
      .setFooter({ text: guild.name });

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
      .values({
        guildId,
        ticketCategoryId: category.id,
        ticketLogChannelId: logChannel?.id ?? null,
      })
      .onConflictDoUpdate({
        target: guildSettingsTable.guildId,
        set: {
          ticketCategoryId: category.id,
          ticketLogChannelId: logChannel?.id ?? null,
        },
      });

    await interaction.editReply({
      content: `✅ Ticket system set up! Panel created in <#${ticketChannel.id}>.`,
    });
  } else if (sub === "close") {
    const guildId = interaction.guildId!;
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
    await db
      .update(ticketsTable)
      .set({ status: "closed", closedAt: new Date() })
      .where(eq(ticketsTable.channelId, channelId));

    await logTicketClose(interaction, ticket.userId);
    setTimeout(() => interaction.channel?.delete().catch(() => null), 3000);
  }
}

export async function handleTicketOpen(interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild!;
  const guildId = guild.id;
  const userId = interaction.user.id;

  const existing = await db
    .select()
    .from(ticketsTable)
    .where(
      and(eq(ticketsTable.guildId, guildId), eq(ticketsTable.userId, userId), eq(ticketsTable.status, "open"))
    );

  if (existing.length > 0) {
    await interaction.editReply({ content: `❌ You already have an open ticket: <#${existing[0]!.channelId}>` });
    return;
  }

  const [settings] = await db
    .select()
    .from(guildSettingsTable)
    .where(eq(guildSettingsTable.guildId, guildId));

  const ticketChannel = await guild.channels.create({
    name: `ticket-${interaction.user.username}`,
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
    status: "open",
  });

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("🎫 Support Ticket")
    .setDescription(
      `Hello ${interaction.user}! A staff member will be with you shortly.\nDescribe your issue below.`
    )
    .setFooter({ text: "Click 'Close Ticket' when your issue is resolved." });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("Close Ticket")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger)
  );

  await (ticketChannel as TextChannel).send({ content: `${interaction.user}`, embeds: [embed], components: [row] });
  await interaction.editReply({ content: `✅ Your ticket has been created: <#${ticketChannel.id}>` });
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
  await db
    .update(ticketsTable)
    .set({ status: "closed", closedAt: new Date() })
    .where(eq(ticketsTable.channelId, channelId));

  await logTicketClose(interaction, ticket.userId);
  setTimeout(() => interaction.channel?.delete().catch(() => null), 3000);
}

async function logTicketClose(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  ticketUserId: string
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
      { name: "Channel", value: interaction.channel?.toString() ?? "unknown", inline: true },
      { name: "Opened by", value: `<@${ticketUserId}>`, inline: true },
      { name: "Closed by", value: `${interaction.user}`, inline: true }
    )
    .setTimestamp();

  await (logChannel as TextChannel).send({ embeds: [embed] }).catch(() => null);
}
