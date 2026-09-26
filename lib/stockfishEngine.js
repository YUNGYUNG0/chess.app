// CommonJS on purpose: dynamically requires the vendored Emscripten build,
// which is itself a CommonJS module with its own bundling quirks.
const path = require("path");

// Next.js/webpack tries to statically bundle any `require(expr)` it can see,
// which breaks for a path built at runtime and pointing outside the bundled
// module graph (our vendored engine under /vendor). Going through eval("require")
// hides the call from webpack's static analysis so Node's real, filesystem-based
// require is used instead -- this is the standard workaround for this exact case.
const nodeRequire = eval("require");

const ENGINE_JS = path.join(__dirname, "..", "vendor", "stockfish", "stockfish-19-lite-single.js");
const ENGINE_WASM = path.join(__dirname, "..", "vendor", "stockfish", "stockfish-19-lite-single.wasm");

/**
 * Boots one instance of the vendored Stockfish (lite, single-threaded) engine.
 * Returns a small UCI-ish wrapper: sendCommand(str), onMessage(fn), quit().
 *
 * Each call creates a fresh WASM instance -- for our analysis workload
 * (one engine per analysis request, torn down afterwards) this is simpler
 * and safer than trying to pool/reuse instances across requests.
 */
function createEngine() {
  return new Promise((resolve, reject) => {
    let INIT_ENGINE;
    try {
      INIT_ENGINE = nodeRequire(ENGINE_JS);
    } catch (err) {
      reject(err);
      return;
    }

    const listeners = [];

    const config = {
      locateFile: (file) => (file.indexOf(".wasm") > -1 ? ENGINE_WASM : ENGINE_JS),
      listener: (line) => {
        for (const fn of listeners) fn(line);
      },
    };

    // The vendored engine's Node bootstrap detects the presence of a global
    // `fetch` and, thinking it's helping, sets `fetch = null` so it can fall
    // back to its own XMLHttpRequest shim. On modern Node that global `fetch`
    // is the same one Next.js's own instrumentation relies on, so leaving it
    // nulled out breaks every request made *after* the engine boots. Snapshot
    // it and put it back immediately once the engine has started.
    const originalFetch = global.fetch;
    const enginePromise = INIT_ENGINE()(config);
    if (typeof originalFetch === "function") {
      global.fetch = originalFetch;
    }

    enginePromise
      .then(function checkReady() {
        if (config._isReady) {
          if (!config._isReady()) {
            setTimeout(checkReady, 10);
            return;
          }
        }

        const api = {
          sendCommand(cmd) {
            setImmediate(() => {
              config.ccall("command", null, ["string"], [cmd], {
                async: /^go\b/.test(cmd),
              });
            });
          },
          onMessage(fn) {
            listeners.push(fn);
          },
          quit() {
            api.sendCommand("quit");
          },
        };

        resolve(api);
      })
      .catch(reject);
  });
}

module.exports = { createEngine };
