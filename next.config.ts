import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Build a self-contained server (`.next/standalone/server.js`) with only
   * the files it actually traced. That is what the Dockerfile ships: no
   * `node_modules` in the runtime image, no `npm start`, nothing in the
   * container that is not needed to serve a request.
   *
   * It also has to trace the HEIC decoder's wasm bundle, which is the one
   * thing about this app that a bundler can get wrong quietly — the failure
   * would be an iPhone upload that works locally and 500s in production.
   * `docs/deploy.md` says to check it against a real HEIC after every image
   * build, and the Dockerfile's own smoke test is that same check.
   */
  output: "standalone",

  /** Nothing needs to know which framework serves this. */
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The customer photo, the contact details and the console all
          // live under one origin; none of it is meant to be framed.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // A project UUID is the only credential on a customer URL, so it
          // must never travel over plain HTTP where a proxy can read it.
          // Harmless where TLS is not terminated (a browser ignores this
          // header over http), which is why it is unconditional.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
