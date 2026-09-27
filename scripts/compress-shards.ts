/** One-off/idempotent: gzip data/scores/index.json and packets/*.json (server-data reads either form). */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const root = path.join(process.cwd(), 'data/scores');
let before = 0, after = 0;
for (const f of [path.join(root, 'index.json'), ...fs.readdirSync(path.join(root, 'packets')).filter((x) => x.endsWith('.json')).map((x) => path.join(root, 'packets', x))]) {
  const raw = fs.readFileSync(f); before += raw.length;
  const gz = zlib.gzipSync(raw, { level: 9 }); after += gz.length;
  fs.writeFileSync(f + '.gz', gz); fs.rmSync(f);
}
console.log(`compressed ${(before / 1e6).toFixed(0)} MB -> ${(after / 1e6).toFixed(0)} MB`);
