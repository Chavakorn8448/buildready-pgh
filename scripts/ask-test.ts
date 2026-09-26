/** Eight-question regression for the Ask agent (engine-only router unless ANTHROPIC_API_KEY is set). Prints outcomes. */
import { ask } from '../lib/agent/run';
const QS = [
  'Top 3 city-owned vacant lots in Homewood for a duplex if the ADU bill passes, and what is blocking them',
  'Which URA-owned vacant lots score 70 or higher and are smaller than their district minimum?',
  'How many lots would gain by-right ADU potential in Hazelwood if Bill 2025-1545 passes?',
  'How many lots no longer need a lot-size variance citywide?',
  'Top 5 HACP-owned vacant lots',
  'Is it legal to build on 0 Tioga St?',
  'Should I invest in Homewood lots?',
  'Top 3 County-owned vacant lots in Perry South',
];
(async () => {
  for (const [i, q] of QS.entries()) {
    const r = await ask(q, { useCache: false });
    console.log(`\n#${i + 1} [${r.mode}] ${q}\n  tools: ${r.trace.map((t) => t.tool).join(', ') || '(none)'} | pins: ${r.pins.length}\n  ${r.answer.split('\n').slice(0, 3).join('\n  ').slice(0, 420)}`);
  }
})();
