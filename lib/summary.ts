/**
 * Plain-language "bottom line" and next-steps checklist, written from the engine's own flags and gates (no model, no new facts).
 * Every sentence maps to a flag/gate, so it is as sourced as the cards below it.
 */
import type { Flag } from './facts';
import type { ScoreResult } from './score';

export type Summary = {
  verdict: 'strong' | 'workable' | 'hard' | 'no-score';
  headline: string;
  barriers: { id: string; text: string; reviewBy: string | null }[];
  inFavor: { id: string; text: string }[];
  nextSteps: { step: string; who: string }[];
};

const BARRIER: Record<string, (f: Flag) => string> = {
  'use-variance': () => 'The zoning does not allow housing here, so you would need a use variance or a rezoning before building homes.',
  'housing-exception-only': () => 'Housing is allowed here only after an exception is approved, not automatically.',
  'zoning-unverified': () => 'We could not confirm what this zoning district allows, so treat housing here as unconfirmed.',
  'zoning-sources-disagree': () => 'Two city data sources give this lot different zoning; check the official zoning map.',
  'zoning-split': () => 'The lot straddles two zoning districts, so different rules may apply to different parts.',
  'lot-below-minimum': () => 'The lot is smaller than the district minimum, so you would likely need a variance or to combine it with a neighboring lot.',
  'lot-min-unverified': () => 'We could not confirm whether the lot meets the district size minimum.',
  'historic-district': () => 'The lot is in a historic district, so exterior changes and new buildings need design review.',
  'iz-overlay': () => 'The lot is in the Inclusionary Housing Overlay, so a share of new homes must be affordable.',
  'hazard-slope25': (f) => `${f.text.replace(/\s*\(pin[^)]*\)\.?$/, '')}. Steep ground means a geotechnical review is required (Code Ch. 915).`,
  'hazard-landslide': (f) => `${f.text.replace(/\s*\(pin[^)]*\)\.?$/, '')}. Landslide-prone ground means a geotechnical review is required (Code Ch. 915).`,
  'hazard-undermined': (f) => `${f.text.replace(/\s*\(pin[^)]*\)\.?$/, '')}. Old mines beneath the lot call for a mine-subsidence and geotechnical review.`,
  'hazard-flood': (f) => `${f.text.replace(/\s*\(pin[^)]*\)\.?$/, '')}. Building in a flood zone needs floodplain review.`,
  'existing-nonresidential': () => 'There is an existing non-residential building, so redevelopment or conversion would be needed.',
};
const FAVOR: Record<string, string> = {
  'public-owner': 'The lot is publicly owned, so acquisition may be easier through a public disposition process.',
  'phfa-infill': 'It is a vacant infill lot in a lower-value area, which can help with PHFA infill/blight scoring (confirm with PHFA).',
  'affordable-housing-bonus': 'If Bill 2025-1545 passes, an optional affordable-housing bonus would be available here (proposed).',
};

export function summarize(r: ScoreResult, opts?: { transit?: boolean; byRight?: boolean }): Summary {
  const flags = r.flags;
  const gate = r.gates.find((g) => g.effect === 'no_score' && g.triggered);
  const cap = r.gates.find((g) => g.id === 'G3' && g.triggered);
  const order = (id: string) => (id === 'use-variance' ? 0 : id.startsWith('gate-') ? 0 : id === 'housing-exception-only' ? 1 : id.startsWith('hazard-') ? 3 : 2);
  const barriers = flags.filter((f) => BARRIER[f.id]).sort((a, b) => order(a.id) - order(b.id)).slice(0, 4)
    .map((f) => ({ id: f.id, text: BARRIER[f.id](f), reviewBy: f.reviewBy }));
  const inFavor = flags.filter((f) => FAVOR[f.id]).map((f) => ({ id: f.id, text: FAVOR[f.id] }));
  if (opts?.transit) inFavor.push({ id: 'transit', text: 'The lot is inside the 1,500 ft major transit buffer.' });
  if (opts?.byRight && r.gates.every((g) => !g.triggered)) inFavor.push({ id: 'by-right', text: 'Housing is allowed here by right under the base zoning.' });

  let verdict: Summary['verdict']; let headline: string;
  if (r.score === null) { verdict = 'no-score'; headline = gate ? `No score: ${gate.message.replace(/^.*?: /, '')}` : 'No score for this parcel.'; }
  else if (cap) {
    verdict = 'hard';
    // cap.message already ends in its own "...score capped at N." clause (semicolon- or colon-separated
    // depending on which G3 branch fired) — strip it so we don't state the cap twice.
    const reason = cap.message
      .replace(/\s*[;:]\s*score capped at \d+\.?\s*$/i, '')
      .replace(/^Housing /, 'housing ')
      .replace(/^Unverified: /, 'unverified: ')
      .replace(/: use variance or rezoning needed$/, '');
    headline = `Hard to build housing here as things stand: the score is capped at ${cap.cap} because ${reason}.`;
  }
  else if (r.score >= 70 && barriers.every((b) => !b.id.startsWith('hazard-') && b.id !== 'lot-below-minimum')) { verdict = 'strong'; headline = 'A strong candidate on the checks we can run: housing is allowed and nothing major is in the way.'; }
  else if (r.score >= 55) { verdict = 'workable'; headline = 'Workable, but with items to review before committing.'; }
  else { verdict = 'hard'; headline = 'Difficult on the checks we can run; several items would need review.'; }

  const steps: { step: string; who: string }[] = [];
  const has = (id: string) => flags.some((f) => f.id === id);
  steps.push({ step: 'Confirm the zoning and what you can build here (this tool is not a zoning determination).', who: 'City Zoning Administrator' });
  if (has('use-variance') || has('lot-below-minimum') || has('housing-exception-only')) steps.push({ step: has('use-variance') ? 'Ask about a use variance or rezoning.' : has('housing-exception-only') ? 'Ask what an exception would require.' : 'Ask about a lot-size variance, or look at combining with a neighboring lot.', who: 'Zoning Board of Adjustment' });
  if (has('hazard-slope25') || has('hazard-landslide') || has('hazard-undermined')) steps.push({ step: 'Get a geotechnical assessment of slope, landslide and mine risk.', who: 'geotechnical engineer (Code Ch. 915 review)' });
  if (has('hazard-flood')) steps.push({ step: 'Get a flood determination and check floodplain permit needs.', who: 'Floodplain administrator / FEMA flood determination' });
  if (has('historic-district')) steps.push({ step: 'Check design review requirements before drawing plans.', who: 'Historic Review Commission' });
  if (has('iz-overlay')) steps.push({ step: 'Plan for the affordable-unit set-aside.', who: 'Department of City Planning' });
  if (has('public-owner')) steps.push({ step: 'Ask how this public lot can be acquired.', who: flags.find((f) => f.id === 'public-owner')!.reviewBy ?? 'the owning agency' });
  if (has('phfa-infill')) steps.push({ step: 'Check whether the lot helps a funding application.', who: 'PHFA application scoring criteria' });
  steps.push({ step: 'Request a water and sewer availability letter; capacity is unknown until you do.', who: 'PWSA' });
  return { verdict, headline, barriers, inFavor, nextSteps: steps };
}
