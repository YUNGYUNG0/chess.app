import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  pgn TEXT NOT NULL,
  white_username TEXT NOT NULL,
  black_username TEXT NOT NULL,
  white_rating INTEGER,
  black_rating INTEGER,
  result TEXT NOT NULL,
  time_control TEXT,
  eco TEXT,
  opening TEXT,
  played_at INTEGER NOT NULL,
  url TEXT NOT NULL,
  fetched_for_username TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS analyses (
  game_id TEXT NOT NULL,
  depth INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (game_id, depth)
);

CREATE INDEX IF NOT EXISTS idx_games_fetched_for
  ON games (platform, fetched_for_username);
`;

declare global {
  // eslint-disable-next-line no-var
  var __chessAppDb: Database.Database | undefined;
}

function createDb(): Database.Database {
  const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "app.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA_SQL);
  return db;
}

// Reuse a single connection across hot reloads in dev; each API route
// invocation in prod also just gets this same module-level singleton.
export const db = global.__chessAppDb ?? (global.__chessAppDb = createDb());
