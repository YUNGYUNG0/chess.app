/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // scripts/analyzeWorker.js is invoked at runtime via child_process, not
    // a static import -- Next's automatic dependency tracing (used to decide
    // what to bundle into each serverless function) can't see it, so its own
    // dependencies (chess.js, the engine loader, the vendored wasm files)
    // get silently left out of the deployment unless we list them here.
    outputFileTracingIncludes: {
      "/api/analyze": [
        "./scripts/**/*",
        "./lib/stockfishEngine.js",
        "./vendor/**/*",
        "./node_modules/chess.js/**/*",
      ],
    },
  },
};

module.exports = nextConfig;
