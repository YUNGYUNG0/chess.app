"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import type { Arrow } from "react-chessboard/dist/chessboard/types";

export interface AnalyzedMove {
  ply: number;
  moveNumber: number;
  san: string;
  side: "white" | "black";
  fenBefore: string;
  evalBeforeCp: number;
  evalAfterCp: number;
  cpLoss: number;
  bestMoveSan?: string;
  classification: "best" | "good" | "inaccuracy" | "mistake" | "blunder";
}

const LABELS: Record<AnalyzedMove["classification"], string> = {
  best: "nejlepší tah",
  good: "dobrý tah",
  inaccuracy: "nepřesnost",
  mistake: "chyba",
  blunder: "hrubka",
};

function formatEval(cp: number): string {
  if (Math.abs(cp) >= 90000) {
    const mateIn = Math.max(1, Math.round((100000 - Math.abs(cp)) / 1));
    return cp > 0 ? `Mat za ${mateIn}` : `Mat za ${mateIn} (soupeř)`;
  }
  const pawns = cp / 100;
  const sign = pawns > 0 ? "+" : "";
  return `${sign}${pawns.toFixed(1)}`;
}

function comment(m: AnalyzedMove): string {
  const mateSwing = Math.abs(m.evalAfterCp) >= 90000;
  switch (m.classification) {
    case "best":
      return "Přesně tah, který by zahrál i engine.";
    case "blunder":
      if (mateSwing) {
        return m.bestMoveSan
          ? `Hrubka — ${m.san} pouští soupeře do vyhraného konce. Mnohem lepší bylo ${m.bestMoveSan}.`
          : `Hrubka — po ${m.san} je pozice pro soupeře vyhraná.`;
      }
      return m.bestMoveSan
        ? `Hrubka — ${m.san} zahazuje výhodu. ${m.bestMoveSan} bylo výrazně silnější.`
        : `Hrubka — ${m.san} citelně zhoršil pozici.`;
    case "mistake":
      return m.bestMoveSan
        ? `Chyba — ${m.bestMoveSan} bylo přesnější, ${m.san} pustil soupeře zpátky do hry.`
        : `Chyba — v pozici byl lepší tah než ${m.san}.`;
    case "inaccuracy":
      return m.bestMoveSan
        ? `Drobná nepřesnost — ${m.bestMoveSan} drželo víc, ale ${m.san} není žádná katastrofa.`
        : `Drobná nepřesnost, nic zásadního.`;
    default:
      return "Solidní tah, drží pozici.";
  }
}

function bestMoveArrow(m: AnalyzedMove): Arrow | null {
  if (!m.bestMoveSan) return null;
  try {
    const c = new Chess(m.fenBefore);
    const mv = c.move(m.bestMoveSan);
    return mv ? [mv.from as Arrow[0], mv.to as Arrow[1]] : null;
  } catch {
    return null;
  }
}

export function BoardReview({
  moves,
  youAreWhite,
}: {
  moves: AnalyzedMove[];
  youAreWhite: boolean;
}) {
  const boundaryFens = useMemo(() => {
    if (moves.length === 0) return [new Chess().fen()];
    const fens: string[] = [moves[0].fenBefore];
    for (let i = 0; i < moves.length; i++) {
      if (i + 1 < moves.length) {
        fens.push(moves[i + 1].fenBefore);
      } else {
        try {
          const c = new Chess(moves[i].fenBefore);
          c.move(moves[i].san);
          fens.push(c.fen());
        } catch {
          fens.push(moves[i].fenBefore);
        }
      }
    }
    return fens;
  }, [moves]);

  const firstProblem = moves.findIndex(
    (m) => m.classification === "blunder" || m.classification === "mistake"
  );
  const [ply, setPly] = useState(firstProblem >= 0 ? firstProblem + 1 : 0);

  const boardWrapRef = useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = useState(320);

  useEffect(() => {
    const el = boardWrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setBoardWidth(Math.floor(width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const currentMove = ply > 0 ? moves[ply - 1] : null;
  const arrow = currentMove ? bestMoveArrow(currentMove) : null;

  const goTo = (p: number) => setPly(Math.max(0, Math.min(moves.length, p)));

  return (
    <div className="board-review">
      <div className="board-review__board" ref={boardWrapRef}>
        <Chessboard
          position={boundaryFens[ply]}
          boardOrientation={youAreWhite ? "white" : "black"}
          arePiecesDraggable={false}
          animationDuration={150}
          boardWidth={boardWidth}
          customArrows={arrow ? [arrow] : []}
          customArrowColor="#c69a3b"
        />
      </div>

      <div className="board-review__side">
        <div className="board-review__nav">
          <button type="button" onClick={() => goTo(0)} disabled={ply === 0} aria-label="Na začátek">
            «
          </button>
          <button type="button" onClick={() => goTo(ply - 1)} disabled={ply === 0} aria-label="Předchozí tah">
            ‹
          </button>
          <span className="board-review__ply-label">
            {ply === 0 ? "začátek partie" : `${currentMove!.moveNumber}${currentMove!.side === "white" ? "." : "…"} ${currentMove!.san}`}
          </span>
          <button
            type="button"
            onClick={() => goTo(ply + 1)}
            disabled={ply === moves.length}
            aria-label="Další tah"
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => goTo(moves.length)}
            disabled={ply === moves.length}
            aria-label="Na konec"
          >
            »
          </button>
        </div>

        {currentMove ? (
          <div className={`board-review__comment board-review__comment--${currentMove.classification}`}>
            <span className="board-review__comment-label">{LABELS[currentMove.classification]}</span>
            <p>{comment(currentMove)}</p>
            <span className="board-review__comment-eval">hodnocení: {formatEval(currentMove.evalAfterCp)}</span>
          </div>
        ) : (
          <div className="board-review__comment">
            <p>Výchozí pozice. Krokuj šipkami nebo klikej na tahy v seznamu níž.</p>
          </div>
        )}

        <div className="board-review__strip">
          {moves.map((m, i) => (
            <button
              key={m.ply}
              type="button"
              className={`board-review__chip board-review__chip--${m.classification} ${
                ply === i + 1 ? "is-active" : ""
              }`}
              onClick={() => goTo(i + 1)}
              title={`${m.moveNumber}${m.side === "white" ? "." : "…"} ${m.san}`}
            >
              {m.san}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
