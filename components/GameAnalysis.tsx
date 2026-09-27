"use client";

import { useEffect, useState } from "react";
import { AnalyzedMove, BoardReview } from "@/components/BoardReview";

interface SideSummary {
  blunders: number;
  mistakes: number;
  inaccuracies: number;
  accuracy: number;
}

interface GameAnalysisData {
  moves: AnalyzedMove[];
  evalsWhitePov: number[];
  summary: { white: SideSummary; black: SideSummary };
  cached?: boolean;
}

function EvalSparkline({ evals }: { evals: number[] }) {
  const width = 600;
  const height = 44;
  const clamp = (v: number) => Math.max(-800, Math.min(800, v));
  const points = evals
    .map((v, i) => {
      const x = (i / Math.max(1, evals.length - 1)) * width;
      const y = height / 2 - (clamp(v) / 800) * (height / 2 - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="eval-sparkline" preserveAspectRatio="none">
      <line x1="0" y1={height / 2} x2={width} y2={height / 2} className="eval-sparkline__mid" />
      <polyline points={points} className="eval-sparkline__line" fill="none" />
    </svg>
  );
}

export function GameAnalysis({
  pgn,
  gameId,
  youAreWhite,
}: {
  pgn: string;
  gameId: string;
  youAreWhite: boolean;
}) {
  const [data, setData] = useState<GameAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: gameId, pgn }),
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Analýza selhala.");
        if (!cancelled) setData(body);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Nastala neznámá chyba.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pgn, gameId]);

  if (loading) {
    return (
      <div className="analysis">
        <p className="analysis__loading">
          Analyzuji partii tah po tahu — u delších partií to může trvat i přes minutu…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analysis">
        <p className="form-error">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="analysis">
      <div className="analysis__header">
        <EvalSparkline evals={data.evalsWhitePov} />
        {data.cached && <span className="analysis__cache-badge">z cache</span>}
      </div>

      <div className="analysis__summary">
        {(["white", "black"] as const).map((side) => {
          const s = data.summary[side];
          return (
            <div key={side} className="analysis__summary-card">
              <span className="analysis__summary-side">{side === "white" ? "bílý" : "černý"}</span>
              <span className="analysis__summary-accuracy">{s.accuracy}%</span>
              <span className="analysis__summary-detail">
                {s.blunders} hrubek · {s.mistakes} chyb · {s.inaccuracies} nepřesností
              </span>
            </div>
          );
        })}
      </div>

      <BoardReview moves={data.moves} youAreWhite={youAreWhite} />
    </div>
  );
}
