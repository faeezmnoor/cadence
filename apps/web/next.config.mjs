/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
  // CAD-227: the standing-config surface moved from /briefs to /watches
  // ("watch" is the locked standing-config noun, D-005). 308-redirect the
  // old paths so bookmarks + historical /admin/runs links don't 404.
  async redirects() {
    return [
      { source: "/briefs", destination: "/watches", permanent: true },
      { source: "/briefs/:id", destination: "/watches/:id", permanent: true },
    ];
  },
  // Vercel's serverless trace doesn't pick up the markdown system prompt
  // read via fs.readFileSync at runtime — we need to explicitly include
  // the prompts directory so it's bundled into /var/task. Without this
  // /api/chat throws ENOENT on first call and the UI shows
  // "An error occurred." (see incident 2026-06-01).
  outputFileTracingIncludes: {
    "/api/chat": ["../../prompts/**/*.md"],
  },
};

export default nextConfig;
