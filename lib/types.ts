export type Platform = "chesscom" | "lichess";

export type GameResult = "win" | "loss" | "draw" | "unknown";

export interface NormalizedGame {
  id: string;
  platform: Platform;
  url: string;
  pgn: string;
  playedAt: number; // unix ms
  timeControl: string;
  white: { username: string; rating?: number };
  black: { username: string; rating?: number };
  result: GameResult; // result from the perspective of the searched player
  eco?: string;
  opening?: string;
}
