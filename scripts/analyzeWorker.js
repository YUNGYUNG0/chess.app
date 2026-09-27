#!/usr/bin/env node
"use strict";

// Runs in its own process, one analysis, then exits. This isolation is
// deliberate, not incidental: the vendored Stockfish build leaks module-level
// state across repeated in-process instantiations (confirmed by testing --
// a second analysis in the same long-running process corrupts global `fetch`
// and eventually crashes the whole Node process). A fresh process per
// analysis sidesteps that entirely and, as a bonus, means a bad PGN or an
// engine crash can never take the web server down with it.

const path = require("path");
const { Chess } = require("chess.js");
const { createEngine } = require(path.join(__dirname, "..", "lib", "stockfishEngine.js"));

const MATE_SCORE = 100000;
const MAX_PLIES = 80;

function classify(cpLoss, isTopChoice) {
  if (isTopChoice && cpLoss <= 10) return "best";
  if (cpLoss >= 300) return "blunder";
  if (cpLoss >= 100) return "mistake";
  if (cpLoss >= 50) return "inaccuracy";
  return "good";
}

function estimateAccuracy(cpLosses) {
  if (cpLosses.length === 0) return 100;
  const avg = cpLosses.reduce((a, b) => a + b, 0) / cpLosses.length;
  const acc = 100 * Math.exp(-avg / 200);
  return Math.round(Math.max(0, Math.min(100, acc)));
}

function parseScoreLine(line) {
  const mateMatch = line.match(/score mate (-?\d+)/);
  if (mateMatch) {
    const mateIn = parseInt(mateMatch[1], 10);
    const sign = mateIn > 0 ? 1 : -1;
    return sign * (MATE_SCORE - Math.abs(mateIn));
  }
  const cpMatch = line.match(/score cp (-?\d+)/);
  if (cpMatch) return parseInt(cpMatch[1], 10);
  return null;
}

function parseBestMove(line) {
  const m = line.match(/^bestmove (\S+)/);
  if (!m) return null;
  return m[1] === "(none)" ? null : m[1];
}

function search(engine, fen, depth) {
  return new Promise((resolve) => {
    let lastScore = null;
    let settled = false;

    engine.onMessage((line) => {
      const score = parseScoreLine(line);
      if (score !== null) lastScore = score;

      if (line.startsWith("bestmove") && !settled) {
        settled = true;
        resolve({ scoreCp: lastScore, bestMoveUci: parseBestMove(line) });
      }
    });

    engine.sendCommand(`position fen ${fen}`);
    engine.sendCommand(`go depth ${depth}`);
  });
}

function toWhitePov(scoreCp, sideToMove) {
  const score = scoreCp == null ? 0 : scoreCp;
  return sideToMove === "white" ? score : -score;
}

function uciToSan(fen, uciMove) {
  try {
    const c = new Chess(fen);
    const from = uciMove.slice(0, 2);
    const to = uciMove.slice(2, 4);
    const promotion = uciMove.length > 4 ? uciMove.slice(4) : undefined;
    const move = c.move({ from, to, promotion });
    return move ? move.san : undefined;
  } catch {
    return undefined;
  }
}

function oppositeOfLast(played) {
  const last = played[played.length - 1];
  if (!last) return "white";
  return last.side === "white" ? "black" : "white";
}

async function analyzePgn(pgn, depth) {
  const loaded = new Chess();
  loaded.loadPgn(pgn);
  const sanMoves = loaded.history().slice(0, MAX_PLIES);

  const replay = new Chess();
  const fens = [replay.fen()];
  const played = [];
  for (const san of sanMoves) {
    const side = replay.turn() === "w" ? "white" : "black";
    replay.move(san);
    played.push({ san, side });
    fens.push(replay.fen());
  }

  const engine = await createEngine();
  engine.sendCommand("uci");
  engine.sendCommand("isready");

  try {
    const evalsWhitePov = [];
    const bestMoveUciAt = [];

    for (let i = 0; i < fens.length; i++) {
      const sideToMove = i === played.length ? oppositeOfLast(played) : played[i] ? played[i].side : "white";
      const result = await search(engine, fens[i], depth);
      evalsWhitePov.push(toWhitePov(result.scoreCp, sideToMove));
      bestMoveUciAt.push(result.bestMoveUci);
    }

    const moves = played.map((p, i) => {
      const evalBeforeWhitePov = evalsWhitePov[i];
      const evalAfterWhitePov = evalsWhitePov[i + 1];

      const moverBefore = p.side === "white" ? evalBeforeWhitePov : -evalBeforeWhitePov;
      const moverAfter = p.side === "white" ? evalAfterWhitePov : -evalAfterWhitePov;
      const cpLoss = Math.max(0, moverBefore - moverAfter);

      const bestUci = bestMoveUciAt[i];
      const bestSanRaw = bestUci ? uciToSan(fens[i], bestUci) : undefined;
      const isTopChoice = bestSanRaw ? bestSanRaw === p.san : cpLoss === 0;
      const bestMoveSan = bestSanRaw && bestSanRaw !== p.san ? bestSanRaw : undefined;

      return {
        ply: i + 1,
        moveNumber: Math.floor(i / 2) + 1,
        san: p.san,
        side: p.side,
        fenBefore: fens[i],
        evalBeforeCp: evalBeforeWhitePov,
        evalAfterCp: evalAfterWhitePov,
        cpLoss,
        bestMoveSan,
        classification: classify(cpLoss, isTopChoice),
      };
    });

    const bySide = (side) => moves.filter((m) => m.side === side);
    const summarize = (side) => {
      const sideMoves = bySide(side);
      return {
        blunders: sideMoves.filter((m) => m.classification === "blunder").length,
        mistakes: sideMoves.filter((m) => m.classification === "mistake").length,
        inaccuracies: sideMoves.filter((m) => m.classification === "inaccuracy").length,
        accuracy: estimateAccuracy(sideMoves.map((m) => m.cpLoss)),
      };
    };

    return {
      moves,
      evalsWhitePov,
      summary: { white: summarize("white"), black: summarize("black") },
    };
  } finally {
    engine.quit();
  }
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const input = JSON.parse(await readStdin());
  const depth = typeof input.depth === "number" ? input.depth : 10;
  const result = await analyzePgn(input.pgn, depth);
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(String((err && err.stack) || err));
  process.exit(1);
});
