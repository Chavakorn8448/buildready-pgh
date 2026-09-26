/**
 * Phase 3: builds data/rules/permitted-uses.json.
 * Every cell below was transcribed by eye from the gridded §911.02 Use Table (Council File 2024-0701 attachment,
 * printed 7/18/2024 — the whole table with only Community Home marked as amended; it already contains Ord. 2024-0059 (P/S for
 * Single-Unit Attached in R1D)) and cross-checked against the Oct-2020 print of §911.02 (R1D..UNC, P/H/EMI/GT columns agree except
 * the 2024-0059 change). Live ecode360 / AmLegal were unreachable (Cloudflare 403) so this has NOT been checked against today's code.
 * Blank cell in the table = use not permitted.
 */
import fs from 'node:fs';
import path from 'node:path';

const COLS = ['R1D','R1A','R2','R3','RM','NDO','LNC','NDI','UNC','HC','GI','UI','UC-MU','UC-E','R-MU','P','H','EMI','GT','RIV-RM','RIV-MU','RIV-NS','RIV-GI','RIV-IMU'] as const;
type Col = (typeof COLS)[number];
type Row = Partial<Record<Col, string>>;

// [type]: { district: code }; anything not listed is blank (= not permitted)
const TABLE: Record<string, { standard: string; cells: Row }> = {
  single_unit_detached: { standard: '911.04.A.69', cells: { R1D:'P',R1A:'P',R2:'P',R3:'P',RM:'P',NDO:'P',LNC:'P',NDI:'P',UNC:'P','R-MU':'P',P:'P',H:'A',EMI:'P' } },
  single_unit_attached: { standard: '911.04.A.69; 911.04.A.69A', cells: { R1D:'P/S',R1A:'P',R2:'P',R3:'P',RM:'P',NDO:'P',LNC:'P',NDI:'P',UNC:'P','UC-MU':'P','R-MU':'P',H:'S','RIV-RM':'P','RIV-MU':'P' } },
  two_unit: { standard: '', cells: { R2:'P',R3:'P',RM:'P',NDO:'P',LNC:'P',NDI:'P',UNC:'P','UC-MU':'P','R-MU':'P',GT:'P','RIV-RM':'P','RIV-MU':'P','RIV-IMU':'P' } },
  three_unit: { standard: '', cells: { R3:'P',RM:'P',NDO:'P',LNC:'P',NDI:'P',UNC:'P','UC-MU':'P','R-MU':'P',GT:'P','RIV-RM':'P','RIV-MU':'P','RIV-IMU':'P' } },
  multi_unit: { standard: '911.04.A.85', cells: { RM:'P',NDO:'P',LNC:'P',NDI:'P',UNC:'P',UI:'S','UC-MU':'P','UC-E':'A','R-MU':'P',EMI:'A',GT:'P','RIV-RM':'P','RIV-MU':'P','RIV-NS':'P','RIV-IMU':'P' } },
};
const STATUS: Record<string, string> = { P: 'by_right', A: 'administrator_exception', S: 'special_exception', C: 'conditional_use', 'P/S': 'by_right_with_special_exception_cases', '': 'not_permitted' };
const TYPE_LABEL: Record<string, string> = {
  single_unit_detached: 'Single-Unit Detached Residential', single_unit_attached: 'Single-Unit Attached Residential',
  two_unit: 'Two-Unit Residential', three_unit: 'Three-Unit Residential', multi_unit: 'Multi-Unit Residential (4+ units)',
};
const SOURCE = {
  primary: 'Pittsburgh Zoning Code §911.02 Use Table, as printed in City Council File 2024-0701, attachment "Use Table" (printed 7/18/2024)',
  primaryUrl: 'https://pittsburgh.legistar1.com/pittsburgh/attachments/1b80ecc1-c98f-4d48-8066-41fbea64c8b0.pdf',
  crossCheck: 'Oct-2020 print of §911.02 (R1D..UNC + P/H/EMI/GT columns agree; only difference is Single-Unit Attached in R1D: blank in 2020, P/S in 2024 per Ord. 2024-0059, enacted 4/22/2024)',
  notVerifiedAgainst: 'Live code text (ecode360.com / codelibrary.amlegal.com returned Cloudflare 403). Amendments after July 2024 are not reflected. Re-verify before relying on it.',
  legend: 'P = permitted by right; A = Administrator Exception (§922.08); S = Special Exception; C = Conditional Use; P/S = permitted, special exception for some cases per §911.04.A.69; blank = not permitted',
  retrievedAt: new Date().toISOString().slice(0, 10),
};

const districts: Record<string, any> = {};
for (const col of COLS) {
  const uses: Record<string, any> = {};
  for (const [type, { cells, standard }] of Object.entries(TABLE)) {
    const code = cells[col] ?? '';
    uses[type] = {
      code, status: STATUS[code],
      citation: `Pittsburgh Zoning Code §911.02 Use Table, row "${TYPE_LABEL[type]}", column ${col}${standard ? `; use standard §${standard}` : ''}`,
    };
  }
  const anyByRight = Object.values(uses).some((u: any) => u.status === 'by_right' || u.status === 'by_right_with_special_exception_cases');
  const anyExc = Object.values(uses).some((u: any) => ['administrator_exception', 'special_exception', 'conditional_use'].includes(u.status));
  districts[col] = {
    verified: true,
    housingSummary: anyByRight ? 'by_right' : anyExc ? 'exception_only' : 'not_permitted',
    uses,
  };
}

// Zoning-map codes (WPRDC/ParcelsPublic "zon_new") that have NO column in the Use Table. Their use rules live in other chapters and were NOT verified.
const MAP_TO_COLUMN: Record<string, string> = {
  'GT-A': 'GT', 'GT-B': 'GT', 'GT-C': 'GT', 'GT-D': 'GT', 'GT-E': 'GT',
};
const UNVERIFIED: Record<string, string> = {
  RP: 'Residential Planned Unit Development — Ch. 909 planned development; use table has no RP column',
  CP: 'Commercial Planned Unit Development — Ch. 909',
  AP: 'Airport / planned district — no column in use table',
  'UPR-A': 'Uptown Public Realm District A — Ch. 908 public realm districts, not in §911.02 columns',
  'UPR-B': 'Uptown Public Realm District B — Ch. 908',
  GPRA: 'Grandview Public Realm District A — Ch. 908', GPRB: 'Grandview Public Realm District B — Ch. 908', GPRC: 'Grandview Public Realm District C — Ch. 908',
  'OPR-B': 'Oakland Public Realm District B — Ch. 908',
  MTOBOR: 'Mount Oliver Borough — outside City of Pittsburgh zoning (see gate G1)',
  'SP-1': 'Special Purpose District (Ch. 905) — district-specific use lists; not in §911.02 columns', 'SP-4': 'Special Purpose District (Ch. 905)', 'SP-5': 'Special Purpose District (Ch. 905)',
  'SP-7': 'Special Purpose District (Ch. 905)', 'SP-8': 'Special Purpose District (Ch. 905)', 'SP-9': 'Special Purpose District (Ch. 905)',
  'SP-10': 'Special Purpose District (Ch. 905)', 'SP-11': 'Special Purpose District (Ch. 905)',
};

const out = {
  _meta: {
    description: 'Which housing types each base zoning district allows by right / by exception / not at all, from Pittsburgh Zoning Code Chapter 911 (§911.02).',
    source: SOURCE,
    districtColumns: [...COLS],
    mapCodeToColumn: MAP_TO_COLUMN,
    densitySuffix: 'Zoning-map codes such as R1D-VL, RM-H use the same use-table column as the base district (R1D, RM); the suffix (VL/L/M/H/VH) only sets development standards (§903.03).',
    verifiedDistricts: [...COLS],
    unverifiedDistricts: Object.keys(UNVERIFIED),
    unverifiedReasons: UNVERIFIED,
  },
  districts,
};
fs.writeFileSync(path.resolve(__dirname, '../data/rules/permitted-uses.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${COLS.length} verified district columns; ${Object.keys(UNVERIFIED).length} map codes unverified`);
for (const c of COLS) console.log(c.padEnd(7), districts[c].housingSummary.padEnd(15), Object.entries(districts[c].uses).map(([t, u]: any) => `${t.replace('_unit', '').replace('single_', 's_')}=${u.code || '-'}`).join(' '));
