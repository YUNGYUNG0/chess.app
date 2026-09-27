"use client";

import { useState } from "react";
import { NormalizedGame } from "@/lib/types";
import { GameAnalysis } from "@/components/GameAnalysis";

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "short",
  });
}

function opponent(game: NormalizedGame, username: string): { you: string; them: string; youAreWhite: boolean } {
  const youAreWhite = game.white.username.toLowerCase() === username.toLowerCase();
  return {
    you: youAreWhite ? game.white.username : game.black.username,
    them: youAreWhite ? game.black.username : game.white.username,
    youAreWhite,
  };
}

export function GameList({ games, username }: { games: NormalizedGame[]; username: string }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (games.length === 0) {
    return <p className="empty-state">Pro tohoto hráče se nepodařilo najít žádné nedávné partie.</p>;
  }

  return (
    <div className="game-list">
      {games.map((game) => {
        const { you, them, youAreWhite } = opponent(game, username);
        const isOpen = expandedId === game.id;

        return (
          <div key={game.id} className="game-item">
            <button
              type="button"
              className="game-row"
              aria-expanded={isOpen}
              onClick={() => setExpandedId(isOpen ? null : game.id)}
            >
              <span className={`result-dot ${game.result}`} title={game.result} />
              <span className="game-row__main">
                <span className="game-row__players">
                  <span className="you">{you}</span> ({youAreWhite ? "bílý" : "černý"}) vs {them}
                </span>
                <span className="game-row__meta">
                  {game.timeControl} · {game.platform === "chesscom" ? "chess.com" : "lichess"}
                  {game.eco ? ` · ${game.eco}` : ""}
                </span>
              </span>
              <span className="game-row__opening">{game.opening ?? ""}</span>
              <span className="game-row__date">{formatDate(game.playedAt)}</span>
            </button>

            {isOpen && (
              <div className="game-item__expanded">
                <a href={game.url} target="_blank" rel="noreferrer" className="game-item__source-link">
                  otevřít na {game.platform === "chesscom" ? "chess.com" : "lichess"} ↗
                </a>
                <GameAnalysis pgn={game.pgn} gameId={game.id} youAreWhite={youAreWhite} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
