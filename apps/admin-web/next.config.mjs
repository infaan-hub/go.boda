import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isDev = process.env.NODE_ENV !== "production";

// VS Code, Cursor, Windsurf, and Antigravity render webviews from vscode-webview://
// nested inside the workbench (vscode-file://). frame-ancestors checks every
// ancestor, so allow both schemes (plus localhost preview hosts) explicitly while
// keeping arbitrary third-party websites blocked from framing the app.
// In development, keep X-Frame-Options: SAMEORIGIN + frame-ancestors 'self' so the
// Mobile Preview extension's local relay strips headers and rewrites session cookies.
const frameAncestors = isDev
  ? "'self'"
  : "'self' vscode-webview: vscode-file: http://localhost:* http://127.0.0.1:*";

const cspReportOnly = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://vercel.live",
  "style-src 'self' 'unsafe-inline' https://tiles.openfreemap.org https://vercel.live",
  "img-src 'self' data: blob: https://tiles.openfreemap.org https://vercel.live https://vercel.com",
  "font-src 'self' data: https://tiles.openfreemap.org https://assets.vercel.com",
  "connect-src 'self' https://tiles.openfreemap.org https://*.vercel.app https://vercel.live wss://ws-us3.pusher.com",
  "worker-src 'self' blob:",
  `frame-ancestors ${frameAncestors}`,
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Omit X-Frame-Options in production so CSP frame-ancestors governs framing without
  // tripping preview preflight checks that reject DENY/SAMEORIGIN on remote URLs.
  // Keep SAMEORIGIN in development so localhost preview relays continue to engage.
  ...(isDev ? [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] : []),
  // Enforced (not report-only) so both the preview tool and the browser see the allowlist.
  { key: "Content-Security-Policy", value: `frame-ancestors ${frameAncestors}` },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self)",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  compress: true,
  transpilePackages: [
    "@goboda/ui",
    "@goboda/i18n",
    "@goboda/shared-types",
    "@goboda/db",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
