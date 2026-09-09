import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { Pool } from "pg";
import {
  HashedSessionStore,
  resolveAccountSession,
} from "../packages/account-postgres/dist/session.js";
const url = process.env.TEST_DATABASE_URL;
test(
  "Session store hashes opaque IDs, revokes and respects expiry",
  { skip: !url },
  async () => {
    const pool = new Pool({ connectionString: url });
    const store = new HashedSessionStore({
      pool,
      tableName: "ac_sessions",
      pruneSessionInterval: false,
    });
    const token = randomUUID();
    const set = (data) =>
      new Promise((ok, no) =>
        store.set(token, data, (e) => (e ? no(e) : ok())),
      );
    const get = () =>
      new Promise((ok, no) => store.get(token, (e, s) => (e ? no(e) : ok(s))));
    try {
      await set({
        cookie: { expires: new Date(Date.now() + 60000) },
        accountId: randomUUID(),
      });
      assert.ok(await get());
      assert.equal(
        (
          await pool.query("SELECT count(*) FROM ac_sessions WHERE sid=$1", [
            token,
          ])
        ).rows[0].count,
        "0",
      );
      assert.equal(
        (
          await pool.query("SELECT count(*) FROM ac_sessions WHERE sid=$1", [
            createHash("sha256").update(token).digest("hex"),
          ])
        ).rows[0].count,
        "1",
      );
      await new Promise((ok, no) =>
        store.destroy(token, (e) => (e ? no(e) : ok())),
      );
      assert.equal(await get(), undefined);
      await set({ cookie: { expires: new Date(Date.now() - 1000) } });
      assert.equal(await get(), undefined);
      let destroyed = false;
      const req = {
        session: {
          accountId: "id",
          absoluteExpiresAt: 100,
          destroy: (cb) => {
            destroyed = true;
            cb();
          },
        },
      };
      assert.equal(
        await resolveAccountSession(
          req,
          { getAccount: async () => ({ status: "active" }) },
          100,
        ),
        undefined,
      );
      assert.ok(destroyed);
    } finally {
      store.close();
      await pool.end();
    }
  },
);
