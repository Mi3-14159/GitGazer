import { pgSchema, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const gitgazerSchema = pgSchema("gitgazer");

export const users = gitgazerSchema.table("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  nickname: varchar("nickname", { length: 255 }).notNull(),
});
