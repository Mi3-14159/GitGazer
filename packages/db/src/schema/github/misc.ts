import { sql } from "drizzle-orm";
import { pgPolicy, pgSchema } from "drizzle-orm/pg-core";
import { gitgazerUser } from "../app";

export const githubSchema = pgSchema("github");

export const tenantSeparationPolicy = () =>
  pgPolicy("tenant separation", {
    as: "permissive",
    to: gitgazerUser,
    for: "all",
    using: sql`integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[])`,
  });
