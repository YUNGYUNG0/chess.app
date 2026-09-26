import { execFile } from "child_process";
import path from "path";

export type Side = "white" | "black";
export type MoveClassification = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

export interface AnalyzedMove {
  ply: number;
  moveNumber: number;
  san: string;
  side: Side;
  fenBefore: string;
  evalBeforeCp: number;
  evalAfterCp: number;
  cpLoss: number;
  bestMoveSan?: string;
  classification: MoveClassification;
}

export interface SideSummary {
  blunders: number;
  mistakes: number;
  inaccuracies: number;
  accuracy: number;
}

export interface GameAnalysis {
  moves: AnalyzedMove[];
  evalsWhitePov: number[];
  summary: { white: SideSummary; black: SideSummary };
}

export const DEFAULT_DEPTH = 10;

const WORKER_PATH = path.join(process.cwd(), "scripts", "analyzeWorker.js");
const TIMEOUT_MS = 55_000;

/**
 * Runs one full engine analysis in a dedicated child process and resolves
 * with the parsed result. See scripts/analyzeWorker.js for why this runs
 * out-of-process rather than calling the engine directly from the API route.
 */
export function analyzePgnInSubprocess(pgn: string, depth = DEFAULT_DEPTH): Promise<GameAnalysis> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      process.execPath,
      [WORKER_PATH],
      { maxBuffer: 1024 * 1024 * 32, timeout: TIMEOUT_MS },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr?.trim() || err.message));
          return;
        }
        try {
          resolve(JSON.parse(stdout) as GameAnalysis);
        } catch {
          reject(new Error("Engine worker returned invalid output."));
        }
      }
    );

    child.stdin?.write(JSON.stringify({ pgn, depth }));
    child.stdin?.end();
  });
}
