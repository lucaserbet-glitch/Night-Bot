import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("createserver")
  .setDescription("Create a new Discord server with a full setup (requires bot to be in < 10 servers)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((opt) =>
    opt.setName("name").setDescription("Name for the new server").setRequired(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("template")
      .setDescription("Server template")
      .setRequired(false)
      .addChoices(
        { name: "Community Server", value: "community" },
        { name: "Gaming Server", value: "gaming" },
        { name: "Business Server", value: "business" }
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const name = interaction.options.getString("name", true);
  const template = interaction.options.getString("template") ?? "community";

  const guildCount = interaction.client.guilds.cache.size;
  if (guildCount >= 10) {
    await interaction.editReply({
      content:
        "❌ **Cannot create server:** Discord only allows bots to create servers if they are in fewer than 10 servers. This bot is currently in **" +
        guildCount +
        "** servers.",
    });
    return;
  }

  try {
    const newGuild = await interaction.client.guilds.create({ name });

    const channels = getTemplateChannels(template);
    for (const ch of channels) {
      if (ch.type === ChannelType.GuildCategory) {
        const cat = await newGuild.channels.create({ name: ch.name, type: ChannelType.GuildCategory });
        for (const child of ch.children ?? []) {
          await newGuild.channels.create({
            name: child.name,
            type: child.type,
            parent: cat.id,
            topic: child.topic,
          });
        }
      }
    }

    const invite = await newGuild.invites.create(
      newGuild.channels.cache.filter((c) => c.type === ChannelType.GuildText).first()!.id,
      { maxAge: 0, maxUses: 0 }
    );

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("✅ Server Created!")
      .addFields(
        { name: "Server Name", value: name, inline: true },
        { name: "Template", value: template, inline: true },
        { name: "Invite Link", value: `https://discord.gg/${invite.code}` }
      )
      .setFooter({ text: "Share this link to invite people to your new server." });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply({
      content: `❌ Failed to create server: ${err instanceof Error ? err.message : "Unknown error"}`,
    });
  }
}

type ChildChannel = { name: string; type: ChannelType.GuildText; topic: string };
type CategoryEntry = { name: string; type: ChannelType.GuildCategory; children: ChildChannel[] };

function getTemplateChannels(template: string): CategoryEntry[] {
  const common: CategoryEntry[] = [
    {
      name: "📢 Information",
      type: ChannelType.GuildCategory,
      children: [
        { name: "📋・rules", type: ChannelType.GuildText, topic: "Server rules" },
        { name: "📣・announcements", type: ChannelType.GuildText, topic: "Server announcements" },
        { name: "🎭・roles", type: ChannelType.GuildText, topic: "Get your roles here" },
      ],
    },
    {
      name: "💬 General",
      type: ChannelType.GuildCategory,
      children: [
        { name: "💬・general", type: ChannelType.GuildText, topic: "General chat" },
        { name: "🤖・bot-commands", type: ChannelType.GuildText, topic: "Use bot commands here" },
        { name: "🖼️・media", type: ChannelType.GuildText, topic: "Share images and videos" },
      ],
    },
    {
      name: "🎫 Support",
      type: ChannelType.GuildCategory,
      children: [
        { name: "📩・open-a-ticket", type: ChannelType.GuildText, topic: "Open a support ticket" },
      ],
    },
  ];

  if (template === "gaming") {
    common.push({
      name: "🎮 Gaming",
      type: ChannelType.GuildCategory,
      children: [
        { name: "🎮・gaming-chat", type: ChannelType.GuildText, topic: "Talk about games" },
        { name: "🏆・clips-and-highlights", type: ChannelType.GuildText, topic: "Share your best moments" },
        { name: "🔍・lfg", type: ChannelType.GuildText, topic: "Looking for group" },
      ],
    });
  } else if (template === "business") {
    common.push({
      name: "💼 Work",
      type: ChannelType.GuildCategory,
      children: [
        { name: "📊・projects", type: ChannelType.GuildText, topic: "Project discussions" },
        { name: "💡・ideas", type: ChannelType.GuildText, topic: "Share your ideas" },
        { name: "📁・resources", type: ChannelType.GuildText, topic: "Useful resources and links" },
      ],
    });
  }

  return common;
}
