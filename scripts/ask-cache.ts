/** npm run ask-cache: (re)generates data/ask-cache.json for the showcase questions (uses Claude if ANTHROPIC_API_KEY is set, otherwise the engine-only router). */
import fs from 'node:fs';
import path from 'node:path';
import { ask, normalizeQuestion } from '../lib/agent/run';

const SHOWCASE = [
  'Top 3 city-owned vacant lots in Homewood for a duplex if the ADU bill passes, and what is blocking them',
  'Which URA-owned vacant lots score 70 or higher and are smaller than their district minimum?',
  'How many lots would gain by-right ADU potential in Hazelwood if Bill 2025-1545 passes?',
];
for (const l of fs.existsSync(path.join(process.cwd(), '.env.local')) ? fs.readFileSync('.env.local', 'utf8').split('\n') : []) { const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(l); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
(async () => {
  const out: Record<string, unknown> = {};
  for (const q of SHOWCASE) { const r = await ask(q, { useCache: false }); out[normalizeQuestion(q)] = r; console.log(`Q: ${q}\n[${r.mode}] ${r.answer}\n`); }
  fs.writeFileSync(path.join(process.cwd(), 'data/ask-cache.json'), JSON.stringify(out, null, 1));
})();
