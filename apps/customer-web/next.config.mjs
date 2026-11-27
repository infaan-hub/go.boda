import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isDev = process.env.NODE_ENV !== "production";

const cspReportOnly = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://vercel.live",
  "style-src 'self' 'unsafe-inline' https://tiles.openfreemap.org https://vercel.live",
  "img-src 'self' data: blob: https://tiles.openfreemap.org https://vercel.live https://vercel.com",
  "font-src 'self' data: https://tiles.openfreemap.org https://assets.vercel.com",
  "connect-src 'self' https://tiles.openfreemap.org https://router.project-osrm.org https://*.vercel.app https://vercel.live wss://ws-us3.pusher.com",
  "worker-src 'self' blob:",
  isDev ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: isDev ? "SAMEORIGIN" : "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(self), screen-wake-lock=(self)",
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
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
