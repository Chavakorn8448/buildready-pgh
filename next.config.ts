import type { NextConfig } from 'next';

// The web app reads precomputed JSON from ./data at request time (no live API). Make sure it ships with the serverless functions.
const DATA = ['./data/scores/**/*', './data/opportunity.json', './data/reform-impact.json', './data/validation.json', './data/ai-cache/**/*', './data/ask-cache.json'];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: { '/': DATA, '/*': DATA, '/**/*': DATA, '/api/*': DATA },
  poweredByHeader: false,
};

export default nextConfig;
