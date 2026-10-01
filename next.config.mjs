/** @type {import('next').NextConfig} */
const nextConfig = {
  // node:sqlite is a prefix-only builtin that webpack doesn't know about yet.
  webpack: (config, { isServer }) => {
    if (isServer) config.externals.push({ 'node:sqlite': 'commonjs node:sqlite' });
    return config;
  },
};

export default nextConfig;
