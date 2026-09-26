/**
 * npm run ai-explain [-- --limit=N]   (needs ANTHROPIC_API_KEY in .env.local or the environment; never committed)
 * Writes data/ai-cache/{pin}_{ruleset}.json for the demo parcels (+ top opportunity lots up to --limit). Skips existing files.
 * Without a key this exits 0 and writes nothing: the UI then shows the engine's own flag text (nothing is faked).
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildEvidencePacket, callClaude, validateExplanation } from '../lib/ai/explain';
import { getMeta, getOpportunity, getPacket } from '../lib/web/server-data';
import { runPacket, type RuleSetId } from '../lib/web/run';

function loadEnvLocal() {
  const f = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) { const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
}
loadEnvLocal();
const key = process.env.ANTHROPIC_API_KEY;
if (!key) { console.log('ANTHROPIC_API_KEY not set: skipping AI explanations (UI falls back to engine flag text). Nothing was written.'); process.exit(0); }

const limit = Number((process.argv.find((a) => a.startsWith('--limit=')) ?? '--limit=0').split('=')[1]);
const DEMO = ['0084P00162000000', '0175G00210000000', '0174N00262000000', '0013E00051000000', '0173N00352000000', '0135M00041000000', '0006K00358000000'];
const top = JSON.parse(getOpportunity()).features.slice(0, limit).map((f: any) => f.properties.pin);
const pins = [...new Set([...DEMO, ...top])];
const dir = path.join(process.cwd(), 'data/ai-cache');
fs.mkdirSync(dir, { recursive: true });
const meta = getMeta();

(async () => {
  let n = 0;
  for (const pin of pins) {
    const found = getPacket(pin); if (!found) continue;
    for (const rs of ['current', 'reform-2025-1545'] as RuleSetId[]) {
      const file = path.join(dir, `${pin}_${rs}.json`);
      if (fs.existsSync(file)) continue;
      const res = runPacket(found.packet, meta, rs);
      if (res.score === null) continue;
      const packet = buildEvidencePacket(res);
      try {
        const { json, model } = await callClaude(packet, { apiKey: key });
        const ex = validateExplanation(json, packet, model);
        fs.writeFileSync(file, JSON.stringify(ex, null, 1)); n++;
        console.log(`${pin} ${rs}: ${Object.keys(ex.flags).length} flag explanations, ${ex.nextSteps.length} steps, ${ex.dropped} sentences dropped`);
      } catch (e) { console.error(`${pin} ${rs}: FAILED ${(e as Error).message}`); }
    }
  }
  console.log(`wrote ${n} cache files`);
})();
