import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";
const connectSrc = isProduction ? "connect-src 'self' https: wss:" : "connect-src 'self' http: https: ws: wss:";
const imgSrc = isProduction ? "img-src 'self' data: blob: https:" : "img-src 'self' data: blob: http: https:";
const mediaSrc = isProduction ? "media-src 'self' blob: https:" : "media-src 'self' blob: http: https:";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  imgSrc,
  mediaSrc,
  "font-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline' https:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
  "frame-src 'self' blob: https:",
  connectSrc,
  "object-src 'none'",
  ...(isProduction ? ["upgrade-insecure-requests"] : [])
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin"
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()"
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
