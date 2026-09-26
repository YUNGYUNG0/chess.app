import { db } from "./db";
import { NormalizedGame } from "./types";
import { GameAnalysis } from "./runAnalysis";

const upsertGameStmt = db.prepare(`
  INSERT INTO games (
    id, platform, pgn, white_username, black_username, white_rating, black_rating,
    result, time_control, eco, opening, played_at, url, fetched_for_username, created_at
  ) VALUES (
    @id, @platform, @pgn, @whiteUsername, @blackUsername, @whiteRating, @blackRating,
    @result, @timeControl, @eco, @opening, @playedAt, @url, @fetchedForUsername, @createdAt
  )
  ON CONFLICT(id) DO UPDATE SET
    pgn = excluded.pgn,
    result = excluded.result,
    fetched_for_username = excluded.fetched_for_username
`);

export function upsertGames(games: NormalizedGame[], searchedUsername: string): void {
  const now = Date.now();
  const insertMany = db.transaction((rows: NormalizedGame[]) => {
    for (const g of rows) {
      upsertGameStmt.run({
        id: g.id,
        platform: g.platform,
        pgn: g.pgn,
        whiteUsername: g.white.username,
        blackUsername: g.black.username,
        whiteRating: g.white.rating ?? null,
        blackRating: g.black.rating ?? null,
        result: g.result,
        timeControl: g.timeControl,
        eco: g.eco ?? null,
        opening: g.opening ?? null,
        playedAt: g.playedAt,
        url: g.url,
        fetchedForUsername: searchedUsername.toLowerCase(),
        createdAt: now,
      });
    }
  });
  insertMany(games);
}

const getGamePgnStmt = db.prepare(`SELECT pgn FROM games WHERE id = ?`);

export function getGamePgn(gameId: string): string | undefined {
  const row = getGamePgnStmt.get(gameId) as { pgn: string } | undefined;
  return row?.pgn;
}

const getAnalysisStmt = db.prepare(
  `SELECT data FROM analyses WHERE game_id = ? AND depth = ?`
);

export function getCachedAnalysis(gameId: string, depth: number): GameAnalysis | undefined {
  const row = getAnalysisStmt.get(gameId, depth) as { data: string } | undefined;
  if (!row) return undefined;
  return JSON.parse(row.data) as GameAnalysis;
}

const saveAnalysisStmt = db.prepare(`
  INSERT INTO analyses (game_id, depth, data, created_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(game_id, depth) DO UPDATE SET data = excluded.data, created_at = excluded.created_at
`);

export function saveAnalysis(gameId: string, depth: number, analysis: GameAnalysis): void {
  saveAnalysisStmt.run(gameId, depth, JSON.stringify(analysis), Date.now());
}
