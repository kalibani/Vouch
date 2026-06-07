import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The handover pipeline calls Claude (Node SDK) and Supabase from route
  // handlers, so the API must run on the Node.js runtime, not Edge.
  serverExternalPackages: ["pino", "pino-pretty"],
};

export default nextConfig;
