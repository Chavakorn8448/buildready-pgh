/** Fails (exit 1) if any owner-name / contractor / mailing-address / editor-user field name appears in data/raw or data/processed. */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const ALLOWED_OWNER_KEYS = new Set(['ownertype', 'ownerdesc', 'ownercateg', 'ownercode', 'ownertypes']);
const BAD = /"(propertyow\w*|owner_?name\w*|contractor\w*|applicant\w*|changenoticeaddress\d*|created_?user|last_?edited_?user|created_us|last_edite|last_edi_1)"\s*:/i;
const OWNER_KEY = /"([A-Za-z_]*owner[A-Za-z_]*)"\s*:/gi;

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

export function scan(dirs = ['data/raw', 'data/processed']) {
  const problems: string[] = [];
  let files = 0;
  for (const d of dirs) for (const f of walk(path.join(ROOT, d))) {
    if (!/\.(json|geojson|ndjson|csv|md)$/.test(f)) continue;
    files++;
    const txt = fs.readFileSync(f, 'utf8');
    const m = txt.match(BAD);
    if (m) problems.push(`${path.relative(ROOT, f)}: forbidden field ${m[0]}`);
    for (const om of txt.matchAll(OWNER_KEY)) if (!ALLOWED_OWNER_KEYS.has(om[1].toLowerCase())) { problems.push(`${path.relative(ROOT, f)}: owner-like field ${om[0]}`); break; }
  }
  return { files, problems };
}

if (require.main === module || process.argv[1]?.endsWith('check-pii.ts')) {
  const { files, problems } = scan();
  console.log(`PII check: scanned ${files} files under data/raw + data/processed`);
  if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
  console.log('PII check passed: no owner-name/contractor/mailing-address/editor fields found.');
}
