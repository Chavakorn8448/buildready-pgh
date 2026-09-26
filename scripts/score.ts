/** npm run score <parcelId|address> [--reform] [--json] */
import { loadEngineData, ParcelStore } from '../lib/data/load';
import { compareRuleSets, currentRules, reformRules, scoreParcel } from '../lib';
import { formatComparison, formatResult } from '../lib/format';

const args = process.argv.slice(2);
const reform = args.includes('--reform');
const json = args.includes('--json');
const input = args.filter((a) => !a.startsWith('--')).join(' ').trim();
if (!input) { console.error('usage: npm run score <parcelId|address> [-- --reform] [--json]'); process.exit(1); }

const store = new ParcelStore();
const found = store.lookup(input);
if (found.parcels.length === 0) { console.error(`Not found: ${found.note}`); process.exit(2); }
if (found.parcels.length > 1) {
  console.error(`Ambiguous: ${found.parcels.length} parcels match "${input}". Re-run with one of these parcel IDs:`);
  for (const p of found.parcels.slice(0, 15)) console.error(`  ${p.pin}  ${p.address}  (${p.useDesc ?? '?'}, ${p.zoningDistrict ?? '?'})`);
  process.exit(3);
}
const data = loadEngineData();
const parcel = found.parcels[0];
if (reform) {
  const cmp = compareRuleSets(parcel, data, currentRules, reformRules);
  console.log(json ? JSON.stringify(cmp, null, 2) : formatComparison(cmp));
} else {
  const res = scoreParcel(parcel, data, currentRules);
  console.log(json ? JSON.stringify(res, null, 2) : formatResult(res));
}
