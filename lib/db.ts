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

function resolveDbPath(): string {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  // Vercel (and most serverless platforms) only allow writes under /tmp --
  // everything else in the deployed function is a read-only filesystem.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join("/tmp", "chess-app", "app.db");
  }
  return path.join(process.cwd(), "data", "app.db");
}

function openAt(dbPath: string): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA_SQL);
  return db;
}

function createDb(): Database.Database {
  const primaryPath = resolveDbPath();
  try {
    return openAt(primaryPath);
  } catch (err) {
    // Belt-and-braces fallback for any other read-only-filesystem surprise:
    // better a working, non-persistent cache than every request crashing.
    const fallbackPath = path.join("/tmp", "chess-app", "app.db");
    if (primaryPath === fallbackPath) throw err;
    console.error(
      `[db] Falling back to ${fallbackPath} -- could not open ${primaryPath}:`,
      err
    );
    return openAt(fallbackPath);
  }
}

// Reuse a single connection across hot reloads in dev; each API route
// invocation in prod also just gets this same module-level singleton.
export const db = global.__chessAppDb ?? (global.__chessAppDb = createDb());
