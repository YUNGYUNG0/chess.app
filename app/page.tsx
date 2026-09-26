"use client";

import { useState } from "react";
import { GameList } from "@/components/GameList";
import { NormalizedGame, Platform } from "@/lib/types";

export default function Home() {
  const [platform, setPlatform] = useState<Platform>("chesscom");
  const [username, setUsername] = useState("");
  const [submittedUsername, setSubmittedUsername] = useState("");
  const [games, setGames] = useState<NormalizedGame[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setGames(null);

    try {
      const res = await fetch(
        `/api/games?platform=${platform}&username=${encodeURIComponent(trimmed)}&limit=20`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Nepodařilo se načíst partie.");
      }
      setGames(data.games);
      setSubmittedUsername(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nastala neznámá chyba.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <section className="hero">
        <div className="wrap">
          <div className="hero__grid">
            <div>
              <p className="hero__eyebrow">chess.com / lichess</p>
              <h1 className="hero__title">
                Zjisti, kde ztrácíš <em>body</em>
              </h1>
              <p className="hero__lede">
                Zadej svůj profil a podívej se na svoje poslední partie — v dalším kroku
                je rozebereme tah po tahu a ukážeme, kde přesně jsi chyboval a v jakých
                zahájeních to nejvíc bolí.
              </p>

              <form className="lookup-form" onSubmit={handleSubmit}>
                <div className="platform-toggle" role="group" aria-label="Vyber platformu">
                  <button
                    type="button"
                    aria-pressed={platform === "chesscom"}
                    onClick={() => setPlatform("chesscom")}
                  >
                    chess.com
                  </button>
                  <button
                    type="button"
                    aria-pressed={platform === "lichess"}
                    onClick={() => setPlatform("lichess")}
                  >
                    lichess
                  </button>
                </div>

                <div className="username-row">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="tvoje uživatelské jméno"
                    aria-label="Uživatelské jméno"
                  />
                  <button type="submit" className="btn-primary" disabled={loading}>
                    {loading ? "Načítám…" : "Najít partie"}
                  </button>
                </div>

                {error && <p className="form-error">{error}</p>}
              </form>
            </div>

            <div className="board-deco" aria-hidden="true" />
          </div>
        </div>
      </section>

      <section className="results">
        <div className="wrap">
          {loading && <p className="loading-state">Stahuji poslední partie…</p>}

          {games && !loading && (
            <>
              <div className="results__summary">
                <h2>Poslední partie hráče {submittedUsername}</h2>
                <span className="results__count">{games.length} partií</span>
              </div>
              <GameList games={games} username={submittedUsername} />
              <p className="notice">
                Klikni na partii a rozbalí se tah-po-tahu analýza od enginu — chyby, hrubky,
                nepřesnosti a co bylo lepší zahrát. U delších partií může analýza chvíli trvat.
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
