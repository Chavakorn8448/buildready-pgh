import type { Comparison, ScoreResult } from './score';

const bar = (n: number) => '█'.repeat(Math.round(n / 5)).padEnd(20, '·');

export function formatResult(r: ScoreResult): string {
  const L: string[] = [];
  L.push(`${r.address || '(no street address)'}  [${r.parcelId}]  ${r.neighborhood ?? ''}`);
  L.push(`Rule set: ${r.ruleSet.label} — ${r.ruleSet.status.toUpperCase()}`);
  if (r.ruleSet.status === 'proposed') L.push(`  ${r.ruleSet.statusNote}`);
  L.push('');
  L.push(r.score === null ? 'DEVELOPMENT EASE SCORE: no score (see gates)' : `DEVELOPMENT EASE SCORE: ${r.score} / 100${r.uncappedScore !== r.score ? `  (uncapped ${r.uncappedScore})` : ''}`);
  L.push('');
  L.push('GATES');
  for (const g of r.gates) L.push(`  ${g.id} ${g.triggered ? (g.effect === 'no_score' ? '✖ NO SCORE' : '▲ CAP') : '✔ ok'}  ${g.name}: ${g.message}${g.reviewBy ? `  [review by: ${g.reviewBy}]` : ''}`);
  if (r.subScores) {
    L.push('');
    L.push('SUB-SCORES (0-100, weight → points contributed)');
    for (const [k, s] of Object.entries(r.subScores)) {
      L.push(`  ${k.padEnd(14)} ${String(Math.round(s.score)).padStart(3)}  ${bar(s.score)}  w${s.weight} → ${s.contribution}`);
      for (const n of s.notes) L.push(`      · ${n}`);
      for (const ru of s.rules ?? []) if (ru.maxPoints > 0) L.push(`      · ${ru.ruleId}: ${ru.result} (${ru.points}/${ru.maxPoints}) — ${ru.citation}`);
    }
  }
  L.push('');
  L.push('FLAGS');
  for (const f of r.flags) L.push(`  ${f.severity === 'block' ? '⛔' : f.severity === 'warn' ? '⚠ ' : 'ℹ '} ${f.text}${f.proposed ? ' [PROPOSED]' : ''}\n      review by: ${f.reviewBy ?? '—'}${f.factIds.length ? `   facts: ${f.factIds.join(', ')}` : ''}`);
  L.push('');
  L.push('FACTS (source per fact)');
  for (const f of r.facts) L.push(`  [${f.confidence}] ${f.label}: ${f.value === null ? 'unknown' : f.value}\n      ${f.source} · ${f.sourceUrl} · retrieved ${f.retrievedAt}${f.reviewBy ? ` · review by ${f.reviewBy}` : ''}`);
  const pins = r.overlaps ? Object.values(r.overlaps).filter((o) => o.intersects && o.pin) : [];
  if (pins.length) { L.push(''); L.push('MAP PINS (centroid of overlap)'); for (const o of pins) L.push(`  ${o.layer}: ${o.pin![1]}, ${o.pin![0]}  (${Math.round(o.overlapFraction * 1000) / 10}% of parcel)`); }
  L.push('');
  L.push('Decision support only. Not legal, financial, or zoning advice.');
  return L.join('\n');
}

export function formatComparison(c: Comparison): string {
  const L: string[] = [];
  L.push(formatResult(c.current));
  L.push('\n' + '═'.repeat(78));
  L.push(`REFORM COMPARISON — ${c.reform.ruleSet.label}`);
  L.push(c.reform.ruleSet.statusNote);
  L.push(`  Score: current ${c.current.score ?? 'n/a'} → reform ${c.reform.score ?? 'n/a'}   delta ${c.delta === null ? 'n/a' : (c.delta >= 0 ? '+' : '') + c.delta}`);
  if (c.current.subScores && c.reform.subScores) for (const k of Object.keys(c.current.subScores) as (keyof NonNullable<ScoreResultSub>)[]) {
    const a = c.current.subScores[k].score, b = c.reform.subScores[k].score;
    if (a !== b) L.push(`  ${String(k).padEnd(14)} ${Math.round(a)} → ${Math.round(b)}`);
  }
  L.push('  Flags added under reform:'); for (const f of c.flagsAdded) L.push(`    + ${f.text}  [review by: ${f.reviewBy ?? '—'}]`); if (!c.flagsAdded.length) L.push('    (none)');
  L.push('  Flags removed under reform:'); for (const f of c.flagsRemoved) L.push(`    - ${f.text}`); if (!c.flagsRemoved.length) L.push('    (none)');
  L.push('  Flags changed:'); for (const f of c.flagsChanged) L.push(`    ~ ${f.id}\n        current: ${f.current}\n        reform:  ${f.reform}`); if (!c.flagsChanged.length) L.push('    (none)');
  return L.join('\n');
}
type ScoreResultSub = NonNullable<ScoreResult['subScores']>;
