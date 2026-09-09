import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  migrateAccounts,
  PostgresAccountRepository,
} from "@tts-workbench/account-postgres";
import { AccountService, argon2Passwords } from "@tts-workbench/account-core";
const url = process.env.TEST_DATABASE_URL;
test(
  "PostgreSQL migration, uniqueness and atomic disable",
  { skip: !url },
  async () => {
    await migrateAccounts(url);
    await migrateAccounts(url);
    const pool = new Pool({ connectionString: url });
    const repo = new PostgresAccountRepository(pool);
    const a = {
      id: randomUUID(),
      login: `test-${randomUUID()}`,
      displayName: "Test",
      passwordHash: "hash-fixture",
      status: "active",
    };
    try {
      const results = await Promise.allSettled([
        repo.create(a),
        repo.create({ ...a, id: randomUUID() }),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const stored = await repo.findByLogin(a.login);
      assert.ok(stored);
      await repo.disable(stored.id);
      assert.equal((await repo.get(stored.id)).status, "disabled");
    } finally {
      await pool.query("DELETE FROM ac_accounts WHERE login=$1", [a.login]);
      await pool.end();
    }
  },
);
test(
  "Real Argon2 credentials and disabled identity",
  { skip: !url },
  async () => {
    const pool = new Pool({ connectionString: url });
    const repo = new PostgresAccountRepository(pool);
    const service = new AccountService({
      repository: repo,
      passwords: argon2Passwords,
      randomId: randomUUID,
    });
    const login = `user-${randomUUID()}`,
      password = "Eight123";
    try {
      const account = await service.createAccount({
        login,
        password,
        displayName: "名前",
      });
      assert.equal(
        (
          await service.authenticateCredentials({
            login: login.toUpperCase(),
            password,
          })
        ).id,
        account.id,
      );
      assert.equal("passwordHash" in account, false);
      assert.match(
        (await repo.findByLogin(login)).passwordHash,
        /^\$argon2id\$/,
      );
      await assert.rejects(
        service.authenticateCredentials({
          login,
          password: "Wrong-password-42",
        }),
        { code: "INVALID_CREDENTIALS" },
      );
      await service.disableAccount(account.id);
      await assert.rejects(
        service.authenticateCredentials({ login, password }),
        { code: "INVALID_CREDENTIALS" },
      );
    } finally {
      await pool.query("DELETE FROM ac_accounts WHERE login=$1", [login]);
      await pool.end();
    }
  },
);
