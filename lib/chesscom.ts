import { NormalizedGame, GameResult } from "./types";

const BASE = "https://api.chess.com/pub";

interface ChessComPlayerSide {
  username: string;
  rating?: number;
  result: string;
}

interface ChessComGame {
  url: string;
  pgn: string;
  time_control: string;
  end_time: number; // unix seconds
  white: ChessComPlayerSide;
  black: ChessComPlayerSide;
}

interface ArchivesResponse {
  archives: string[];
}

const WIN_RESULTS = new Set(["win"]);
const DRAW_RESULTS = new Set([
  "agreed",
  "repetition",
  "stalemate",
  "50move",
  "insufficient",
  "timevsinsufficient",
]);

function sideOutcome(result: string): GameResult {
  if (WIN_RESULTS.has(result)) return "win";
  if (DRAW_RESULTS.has(result)) return "draw";
  return "loss";
}

function extractEco(pgn: string): { eco?: string; opening?: string } {
  const ecoMatch = pgn.match(/\[ECO\s+"([^"]+)"\]/);
  const openingMatch = pgn.match(/\[ECOUrl\s+"[^"]*\/([^"]+)"\]/);
  return {
    eco: ecoMatch?.[1],
    opening: openingMatch?.[1]?.replace(/-/g, " "),
  };
}

/**
 * Fetches the player's most recent games from chess.com, newest first.
 * Chess.com only exposes games grouped by monthly archives, so we walk
 * backwards from the most recent archive until we have enough games.
 */
export async function fetchChessComGames(
  username: string,
  limit = 20
): Promise<NormalizedGame[]> {
  const archivesRes = await fetch(`${BASE}/player/${encodeURIComponent(username)}/games/archives`);
  if (!archivesRes.ok) {
    throw new Error(`chess.com: player "${username}" not found or API error (${archivesRes.status})`);
  }
  const { archives }: ArchivesResponse = await archivesRes.json();
  if (archives.length === 0) return [];

  const games: NormalizedGame[] = [];
  // Walk archives from most recent to oldest until we have `limit` games.
  for (let i = archives.length - 1; i >= 0 && games.length < limit; i--) {
    const res = await fetch(archives[i]);
    if (!res.ok) continue;
    const data: { games: ChessComGame[] } = await res.json();
    const monthGames = [...data.games].reverse(); // newest first within the month

    for (const g of monthGames) {
      const isWhite = g.white.username.toLowerCase() === username.toLowerCase();
      const side = isWhite ? g.white : g.black;
      const { eco, opening } = extractEco(g.pgn ?? "");

      games.push({
        id: g.url,
        platform: "chesscom",
        url: g.url,
        pgn: g.pgn,
        playedAt: g.end_time * 1000,
        timeControl: g.time_control,
        white: { username: g.white.username, rating: g.white.rating },
        black: { username: g.black.username, rating: g.black.rating },
        result: sideOutcome(side.result),
        eco,
        opening,
      });

      if (games.length >= limit) break;
    }
  }

  return games;
}
