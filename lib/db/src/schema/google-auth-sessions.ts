import { index, json, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type { z } from "zod/v4";

// Matches connect-pg-simple's table.sql. The session store creates this additive
// table on first use; including it here prevents future schema pushes dropping it.
export const googleAuthSessionsTable = pgTable("google_auth_sessions", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").$type<Record<string, unknown>>().notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
}, (table) => [index("IDX_google_auth_sessions_expire").on(table.expire)]);
export const insertGoogleAuthSessionSchema = createInsertSchema(googleAuthSessionsTable);
export type GoogleAuthSession = typeof googleAuthSessionsTable.$inferSelect;
export type InsertGoogleAuthSession = z.infer<typeof insertGoogleAuthSessionSchema>;
