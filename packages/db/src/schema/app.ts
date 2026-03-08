import { pgRole } from "drizzle-orm/pg-core";

export const gitgazerUser = pgRole("gitgazer_user", {
  createRole: true,
  createDb: false,
  inherit: true,
});
