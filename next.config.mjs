/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // The dev server needs eval for fast refresh, so the policy only applies to production builds.
  isProd && {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js inlines its bootstrap scripts and styles.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      // Server actions post to this origin; the QuickBooks sign-in is a plain link.
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  },
].filter(Boolean);

const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // node:sqlite is a prefix-only builtin that webpack doesn't know about yet.
  webpack: (config, { isServer }) => {
    if (isServer) config.externals.push({ 'node:sqlite': 'commonjs node:sqlite' });
    return config;
  },
};

export default nextConfig;
