import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"],
  apiKey: process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] ?? "dummy",
});

export const data = new SlashCommandBuilder()
  .setName("ai")
  .setDescription("Ask the AI assistant a question")
  .addStringOption((opt) =>
    opt.setName("prompt").setDescription("Your question or message").setRequired(true).setMaxLength(1000)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const prompt = interaction.options.getString("prompt", true);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 1024,
      messages: [
        {
          role: "system",
          content: `You are a helpful Discord bot assistant named Night BOT. Keep your answers concise and friendly. You are responding in a Discord server called "${interaction.guild?.name ?? "Unknown"}".`,
        },
        { role: "user", content: prompt },
      ],
    });

    const answer = response.choices[0]?.message?.content ?? "Sorry, I couldn't generate a response.";

    const chunks = splitMessage(answer, 4096);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: interaction.user.displayName, iconURL: interaction.user.displayAvatarURL() })
      .addFields({ name: "Question", value: prompt.slice(0, 1024) })
      .setDescription(chunks[0] ?? answer)
      .setFooter({ text: "Powered by AI" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp({ content: chunks[i] });
    }
  } catch (err) {
    await interaction.editReply({
      content: `❌ AI error: ${err instanceof Error ? err.message : "Unknown error"}`,
    });
  }
}

function splitMessage(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  while (text.length > maxLength) {
    chunks.push(text.slice(0, maxLength));
    text = text.slice(maxLength);
  }
  if (text) chunks.push(text);
  return chunks;
}
