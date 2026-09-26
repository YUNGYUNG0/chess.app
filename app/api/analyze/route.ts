import { NextRequest, NextResponse } from "next/server";
import { analyzePgnInSubprocess, DEFAULT_DEPTH } from "@/lib/runAnalysis";
import { getCachedAnalysis, getGamePgn, saveAnalysis } from "@/lib/repo";

// Needs a real Node.js process (spawns a child process running the WASM engine), not the edge runtime.
export const runtime = "nodejs";
// Longer analyses (many plies * engine depth) can take a while on serverless platforms.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { id?: string; pgn?: string; depth?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, depth } = body;
  let pgn = body.pgn;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });
  }

  const usedDepth = typeof depth === "number" ? Math.min(Math.max(depth, 4), 18) : DEFAULT_DEPTH;

  const cached = getCachedAnalysis(id, usedDepth);
  if (cached) {
    return NextResponse.json({ ...cached, cached: true });
  }

  if (!pgn) {
    pgn = getGamePgn(id);
  }
  if (!pgn) {
    return NextResponse.json(
      { error: "Neznámá partie (chybí PGN) — nejdřív ji načti přes vyhledání partií." },
      { status: 400 }
    );
  }

  try {
    const analysis = await analyzePgnInSubprocess(pgn, usedDepth);
    saveAnalysis(id, usedDepth, analysis);
    return NextResponse.json({ ...analysis, cached: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Analýza selhala: ${message}` }, { status: 500 });
  }
}
