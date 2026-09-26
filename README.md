# Rozbor — analýza šachových partií

MVP: vyber platformu (chess.com / lichess), zadej uživatelské jméno, uvidíš poslední partie.
Klikni na partii a rozbalí se enginová analýza tah po tahu (chyby, hrubky, nepřesnosti,
co bylo lepší zahrát). Výsledky analýz se ukládají do SQLite, takže se partie
neanalyzuje pokaždé znovu.

## Spuštění

```bash
npm install
npm run dev
```

Otevři http://localhost:3000. Databázový soubor (`data/app.db`) se vytvoří sám při
prvním spuštění, nic se nemusí ručně zakládat.

## Struktura projektu

```
app/
  page.tsx               hlavní stránka (formulář + seznam partií)
  layout.tsx              root layout, fonty
  globals.css              design tokeny a styly
  api/games/route.ts      API route: stáhne partie z chess.com/lichess, uloží je do DB
  api/analyze/route.ts    API route: cache-first — zkusí DB, jinak spustí enginovou analýzu
lib/
  chesscom.ts              chess.com public API klient
  lichess.ts                lichess public API klient
  types.ts                 sdílený typ NormalizedGame
  db.ts                     SQLite připojení (singleton) + schema
  repo.ts                   DB dotazy: uložení partií, čtení/zápis cache analýz
  runAnalysis.ts             spustí analyzeWorker.js jako subproces a vrátí výsledek
  stockfishEngine.js         Node loader pro vendorovaný Stockfish WASM (UCI wrapper)
scripts/
  analyzeWorker.js           samostatný skript: jedna analýza, jeden proces, pak exit
vendor/stockfish/          vendorovaná "lite single-threaded" WASM verze Stockfish 19 (~1.8 MB)
components/
  GameList.tsx              seznam partií, klik rozbalí analýzu
  GameAnalysis.tsx           enginová analýza jedné partie (graf, souhrn, tabulka tahů)
```

## Jak fungují API

- **chess.com** (`api.chess.com/pub`) — veřejné, bez API klíče. Partie jsou seskupené
  po měsíčních archivech, takže se prochází od nejnovějšího měsíce zpátky, dokud
  nemáme dost partií.
- **lichess** (`lichess.org/api`) — veřejné, bez API klíče. Endpoint pro export partií
  vrací NDJSON (řádek = jedna partie v JSONu) s PGN i daty o zahájení rovnou uvnitř.

Obě knihovny (`lib/chesscom.ts`, `lib/lichess.ts`) sjednocují data do stejného tvaru
(`NormalizedGame`), takže zbytek appky platformu neřeší.

## Jak funguje enginová analýza

- Používáme **Stockfish 19 "lite, single-threaded"** WASM build (~1.8 MB), vendorovaný
  přímo v repozitáři (`vendor/stockfish/`) — žádné stahování za běhu, žádný externí
  proces navíc. Je o dost slabší než plná verze (tam soubory mají desítky MB), ale pro
  amatérskou/klubovou úroveň je naprosto dostačující a rychlá.
- **Analýza běží v samostatném subprocesu** (`scripts/analyzeWorker.js`), spuštěném
  přes `child_process.execFile` z `lib/runAnalysis.ts` — ne přímo uvnitř Next.js
  serveru. Tohle není zbytečná komplikace navíc, ale záměr: vendorovaný engine má
  bug, kdy druhá instance ve stejném Node procesu naruší globální stav (mimo jiné
  přepíše globální `fetch`, což při testování spolehlivě sundávalo celý server po
  druhé analýze). Samostatný proces na analýzu = žádné sdílení stavu, a navíc
  bonus: shozený/zamrzlý engine nikdy nesundá webový server s sebou.
- Postup: projde PGN tah po tahu, pro každou pozici spustí `go depth N`
  (výchozí hloubka 10, capped na 4–18), spočítá **centipawn loss** každého tahu
  (o kolik se hráč odchýlil od nejlepšího možného pokračování) a podle toho ho
  zařadí: `blunder` (hrubka) / `mistake` (chyba) / `inaccuracy` (nepřesnost) / `good`.
  Přesnost (%) je hrubý odhad z průměrné ztráty, ne přesně stejný vzorec jako
  chess.com/lichess, ale srovnatelně vypovídající.
- Delší partie = víc pozic k ohodnocení = déle to trvá (desítky sekund až přes minutu
  u dlouhých partií). Kvůli tomu je počet analyzovaných půltahů omezený na 80
  (`MAX_PLIES` v `scripts/analyzeWorker.js`).

## Jak funguje databáze / cache

- SQLite soubor přes `better-sqlite3` (`data/app.db`, mimo git). Dvě tabulky:
  `games` (partie stažené z chess.com/lichess, včetně PGN) a `analyses`
  (výsledek enginové analýzy podle `game_id` + `depth`).
- `/api/games` při každém načtení partií je zároveň uloží do DB (upsert).
- `/api/analyze` nejdřív zkusí `analyses` tabulku — pokud tam už výsledek pro
  danou partii a hloubku je, vrátí ho okamžitě (`cached: true`, v UI drobný
  štítek "z cache") a engine se vůbec nespouští. Jinak partii vytáhne (buď z
  requestu, nebo z `games` tabulky přes `id`), spustí analýzu a výsledek uloží.

Až budeme appku nasazovat naostro s víc uživateli najednou, tohle se dá snadno
přehodit na Postgres — mění se jen `lib/db.ts` a SQL v `lib/repo.ts` zůstává
skoro identické.

### ⚠️ Nasazení na serverless (Vercel apod.)

API route má nastavené `maxDuration = 60`, ale **na Vercel Hobby plánu je tvrdý limit
10 sekund** bez ohledu na to, co si appka nastaví — delší partie by tam timeoutovaly.
Navíc SQLite soubor na serverless platformách typicky nepřežije mezi requesty (efemérní
filesystem). Řešení až budeme appku nasazovat naostro:
- Vercel Pro (limit až 300s) + přejít na hostovaný Postgres (Vercel Postgres, Neon, ...), nebo
- vlastní server / VPS (Node proces bez limitu, SQLite soubor přežije), nebo
- přepracovat analýzu na frontovou úlohu (job queue) — subprocess běží na pozadí,
  frontend se ptá na výsledek, žádný HTTP request nečeká celou dobu.

## Další fáze (zatím neimplementováno)

1. **Statistiky zahájení** — agregace přes partie podle ECO kódu, kde hráč nejvíc ztrácí.
2. **Trénink zahájení a puzzly** — lichess nabízí volně staženou databázi puzzlů.
3. **Vizuální šachovnice s přehráváním** — `react-chessboard` je v závislostech,
   zatím nepoužitý; hodí se na zobrazení pozice u konkrétního tahu v analýze.

## Poznámky

- Fonty (Newsreader, Inter, JetBrains Mono) se načítají z Google Fonts přes `<link>`
  v `app/layout.tsx` — funguje to v běžném prohlížeči, nevyžaduje to nic navíc.
- Žádné API klíče nejsou potřeba.
- Stockfish.js/WASM je pod GPL-3.0 (viz `vendor/stockfish/LICENSE.txt`) — při
  zveřejnění projektu na GitHubu je dobré na to v README repozitáře odkázat.
