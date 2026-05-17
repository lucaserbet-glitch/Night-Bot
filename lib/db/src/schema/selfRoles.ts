import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const selfRolesTable = pgTable("self_roles", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  roleId: text("role_id").notNull(),
  roleName: text("role_name").notNull(),
  emoji: text("emoji"),
  description: text("description"),
  category: text("category").notNull().default("Allgemein"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSelfRoleSchema = createInsertSchema(selfRolesTable).omit({ id: true, createdAt: true });
export type InsertSelfRole = z.infer<typeof insertSelfRoleSchema>;
export type SelfRole = typeof selfRolesTable.$inferSelect;
