import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const guildSettingsTable = pgTable("guild_settings", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull().unique(),
  ticketCategoryId: text("ticket_category_id"),
  ticketLogChannelId: text("ticket_log_channel_id"),
  welcomeChannelId: text("welcome_channel_id"),
  welcomeMessage: text("welcome_message"),
  rulesChannelId: text("rules_channel_id"),
  rulesMessageId: text("rules_message_id"),
  rulesContent: text("rules_content"),
  selfRolesPanelChannelId: text("self_roles_panel_channel_id"),
  selfRolesPanelMessageId: text("self_roles_panel_message_id"),
  selfRolesPanelMessageIds: text("self_roles_panel_message_ids"),
  verifyChannelId: text("verify_channel_id"),
  verifyMessageId: text("verify_message_id"),
  unverifiedRoleId: text("unverified_role_id"),
  verifiedRoleId: text("verified_role_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertGuildSettingsSchema = createInsertSchema(guildSettingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGuildSettings = z.infer<typeof insertGuildSettingsSchema>;
export type GuildSettings = typeof guildSettingsTable.$inferSelect;
