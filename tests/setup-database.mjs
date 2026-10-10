import { migrateAccounts } from "@tts-workbench/account-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

// Complete migrations before Node starts test files in parallel.
if (databaseUrl) {
  await migrateAccounts(databaseUrl);
}
