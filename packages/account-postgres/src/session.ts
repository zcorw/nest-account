import { createHash } from "node:crypto";
import session, { type SessionData } from "express-session";
import connectPgSimple from "connect-pg-simple";
import type { Pool } from "pg";
import type { Request } from "express";
import type { AccountService, Account } from "@tts-workbench/account-core";
declare module "express-session" {
  interface SessionData {
    accountId?: string;
    absoluteExpiresAt?: number;
    csrfToken?: string;
    csrfIssuedAt?: number;
  }
}
const PgStore = connectPgSimple(session);
const digest = (id: string) => createHash("sha256").update(id).digest("hex");
/** Only SHA-256 session identifiers reach the mature PostgreSQL store. */
export class HashedSessionStore extends PgStore {
  override get(
    id: string,
    cb: (error: any, data?: SessionData | null) => void,
  ): void {
    super.get(digest(id), cb);
  }
  override set(
    id: string,
    data: SessionData,
    cb?: (error?: any) => void,
  ): void {
    super.set(digest(id), data, cb);
  }
  override destroy(id: string, cb?: (error?: any) => void): void {
    super.destroy(digest(id), cb);
  }
  override touch(id: string, data: SessionData, cb?: () => void): void {
    super.touch(digest(id), data, cb);
  }
}
export function createAccountSession(options: {
  pool: Pool;
  secret: string;
  secure: boolean;
  idleMs?: number;
}) {
  if (options.secret.length < 32)
    throw new Error("Session secret must contain at least 32 characters");
  const store = new HashedSessionStore({
    pool: options.pool,
    tableName: "ac_sessions",
    createTableIfMissing: false,
    pruneSessionInterval: 86400,
  });
  return {
    store,
    middleware: session({
      store,
      secret: options.secret,
      name: "wb_session",
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: options.secure,
        path: "/",
        maxAge: options.idleMs ?? 86400000,
      },
    }),
  };
}
export async function resolveAccountSession(
  req: Request,
  accounts: AccountService,
  now = Date.now(),
): Promise<Account | undefined> {
  if (!req.session?.accountId) return undefined;
  const account = await accounts.getAccount(req.session.accountId);
  if (
    !req.session.absoluteExpiresAt ||
    now >= req.session.absoluteExpiresAt ||
    !account ||
    account.status !== "active"
  ) {
    await new Promise<void>((resolve, reject) =>
      req.session.destroy((error) => (error ? reject(error) : resolve())),
    );
    return undefined;
  }
  req.session.cookie.maxAge = Math.min(
    86400000,
    req.session.absoluteExpiresAt - now,
  );
  return account;
}
