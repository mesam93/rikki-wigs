import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { SESSION_COOKIE, SESSION_IDLE_MAX_AGE } from "./google-policy";

export function googleSessionMiddleware() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required");
  const PgSession = connectPgSimple(session);
  return session({
    name: SESSION_COOKIE,
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: new PgSession({
      pool,
      tableName: "google_auth_sessions",
      // The store creates only its own new table; existing business tables are untouched.
      createTableIfMissing: true,
      pruneSessionInterval: 60,
      errorLog: () => logger.error("Google session store operation failed"),
    }),
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_IDLE_MAX_AGE,
    },
  });
}
