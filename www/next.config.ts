import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Note: Removed 'output: export' to enable middleware for proper i18n routing
  // For static deployment, use platforms that support Next.js (Vercel, Netlify, etc.)
};

export default withNextIntl(nextConfig);
