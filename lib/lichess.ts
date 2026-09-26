import { NormalizedGame, GameResult } from "./types";

interface LichessPlayer {
  user?: { name: string };
  rating?: number;
  name?: string; // present for anonymous/ai players sometimes
}

interface LichessGame {
  id: string;
  createdAt: number;
  lastMoveAt: number;
  speed: string;
  perf: string;
  status: string;
  winner?: "white" | "black";
  players: { white: LichessPlayer; black: LichessPlayer };
  opening?: { eco: string; name: string };
  pgn?: string;
}

function outcomeFor(side: "white" | "black", winner?: "white" | "black"): GameResult {
  if (!winner) return "draw";
  return winner === side ? "win" : "loss";
}

/**
 * Fetches the player's most recent games from lichess, newest first.
 * Uses the NDJSON export endpoint with PGN embedded per game.
 */
export async function fetchLichessGames(
  username: string,
  limit = 20
): Promise<NormalizedGame[]> {
  const url = new URL(`https://lichess.org/api/games/user/${encodeURIComponent(username)}`);
  url.searchParams.set("max", String(limit));
  url.searchParams.set("opening", "true");
  url.searchParams.set("pgnInJson", "true");
  url.searchParams.set("clocks", "false");
  url.searchParams.set("evals", "false");
  url.searchParams.set("sort", "dateDesc");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/x-ndjson" },
  });
  if (!res.ok) {
    throw new Error(`lichess: player "${username}" not found or API error (${res.status})`);
  }

  const text = await res.text();
  const lines = text.split("\n").filter((l) => l.trim().length > 0);

  const games: NormalizedGame[] = lines.map((line) => {
    const g: LichessGame = JSON.parse(line);
    const whiteName = g.players.white.user?.name ?? g.players.white.name ?? "Anonymous";
    const blackName = g.players.black.user?.name ?? g.players.black.name ?? "Anonymous";
    const isWhite = whiteName.toLowerCase() === username.toLowerCase();

    return {
      id: g.id,
      platform: "lichess",
      url: `https://lichess.org/${g.id}`,
      pgn: g.pgn ?? "",
      playedAt: g.lastMoveAt ?? g.createdAt,
      timeControl: g.speed,
      white: { username: whiteName, rating: g.players.white.rating },
      black: { username: blackName, rating: g.players.black.rating },
      result: outcomeFor(isWhite ? "white" : "black", g.winner),
      eco: g.opening?.eco,
      opening: g.opening?.name,
    };
  });

  return games;
}
