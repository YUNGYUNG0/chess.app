import { NextRequest, NextResponse } from "next/server";
import { fetchChessComGames } from "@/lib/chesscom";
import { fetchLichessGames } from "@/lib/lichess";
import { Platform } from "@/lib/types";
import { upsertGames } from "@/lib/repo";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const platform = searchParams.get("platform") as Platform | null;
  const username = searchParams.get("username");
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(Number(limitParam), 50) : 20;

  if (!platform || !username) {
    return NextResponse.json(
      { error: "Missing required query params: platform, username" },
      { status: 400 }
    );
  }

  if (platform !== "chesscom" && platform !== "lichess") {
    return NextResponse.json(
      { error: 'platform must be "chesscom" or "lichess"' },
      { status: 400 }
    );
  }

  try {
    const games =
      platform === "chesscom"
        ? await fetchChessComGames(username, limit)
        : await fetchLichessGames(username, limit);

    // Side effect: cache the games (mainly their PGN) so /api/analyze can
    // find them again later without the client having to resend the PGN.
    upsertGames(games, username);

    return NextResponse.json({ games });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
