import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from "discord.js";
import { db } from "@workspace/db";
import { guildSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const data = new SlashCommandBuilder()
  .setName("rules")
  .setDescription("Server rules system")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("setup")
      .setDescription("Set the channel where rules are displayed")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Rules channel")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("set").setDescription("Set or update the server rules (opens editor)")
  )
  .addSubcommand((sub) =>
    sub.setName("show").setDescription("Post the rules in the configured rules channel")
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  if (sub === "setup") {
    const channel = interaction.options.getChannel("channel", true);
    await db
      .insert(guildSettingsTable)
      .values({ guildId, rulesChannelId: channel.id })
      .onConflictDoUpdate({
        target: guildSettingsTable.guildId,
        set: { rulesChannelId: channel.id },
      });
    await interaction.reply({
      content: `✅ Rules channel set to <#${channel.id}>.`,
      ephemeral: true,
    });
  } else if (sub === "set") {
    const [settings] = await db
      .select()
      .from(guildSettingsTable)
      .where(eq(guildSettingsTable.guildId, guildId));

    const modal = new ModalBuilder()
      .setCustomId("rules_set_modal")
      .setTitle("Set Server Rules");

    const input = new TextInputBuilder()
      .setCustomId("rules_text")
      .setLabel("Server Rules")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Enter the server rules here...")
      .setValue(settings?.rulesContent ?? "")
      .setMaxLength(4000)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
  } else if (sub === "show") {
    const [settings] = await db
      .select()
      .from(guildSettingsTable)
      .where(eq(guildSettingsTable.guildId, guildId));

    if (!settings?.rulesContent) {
      await interaction.reply({ content: "❌ No rules set yet. Use `/rules set` first.", ephemeral: true });
      return;
    }

    const targetChannelId = settings.rulesChannelId ?? interaction.channelId;
    const targetChannel = interaction.guild!.channels.cache.get(targetChannelId);

    if (!targetChannel?.isTextBased()) {
      await interaction.reply({ content: "❌ Rules channel not found or not a text channel.", ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle(`📋 ${interaction.guild!.name} — Server Rules`)
      .setDescription(settings.rulesContent)
      .setFooter({ text: "Please follow these rules to keep the server enjoyable for everyone." })
      .setTimestamp();

    if (settings.rulesMessageId) {
      const old = await targetChannel.messages.fetch(settings.rulesMessageId).catch(() => null);
      if (old) await old.edit({ embeds: [embed] });
    } else {
      const sent = await (targetChannel as import("discord.js").TextChannel).send({ embeds: [embed] });
      await db
        .insert(guildSettingsTable)
        .values({ guildId, rulesMessageId: sent.id })
        .onConflictDoUpdate({
          target: guildSettingsTable.guildId,
          set: { rulesMessageId: sent.id },
        });
    }

    await interaction.reply({ content: `✅ Rules posted in <#${targetChannelId}>.`, ephemeral: true });
  }
}
