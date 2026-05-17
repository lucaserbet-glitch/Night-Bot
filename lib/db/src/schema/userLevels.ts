import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userLevelsTable = pgTable("user_levels", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  xp: integer("xp").notNull().default(0),
  level: integer("level").notNull().default(0),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [unique().on(t.guildId, t.userId)]);

export const insertUserLevelSchema = createInsertSchema(userLevelsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUserLevel = z.infer<typeof insertUserLevelSchema>;
export type UserLevel = typeof userLevelsTable.$inferSelect;
