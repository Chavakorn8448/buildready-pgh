/** Parcel-ID and address parsing/normalization. Pure. */
const TYPE: Record<string, string> = {
  STREET: 'ST', STR: 'ST', AVENUE: 'AVE', AV: 'AVE', ROAD: 'RD', BOULEVARD: 'BLVD', DRIVE: 'DR', LANE: 'LN', COURT: 'CT', PLACE: 'PL', TERRACE: 'TER', TERR: 'TER',
  HIGHWAY: 'HWY', CIRCLE: 'CIR', PARKWAY: 'PKWY', ALLEY: 'ALY', SQUARE: 'SQ', WAY: 'WAY', PIKE: 'PIKE', TRAIL: 'TRL', PLAZA: 'PLZ', EXTENSION: 'EXT',
};
const DIR: Record<string, string> = { NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W' };
const ORD: Record<string, string> = { FIRST: '1ST', SECOND: '2ND', THIRD: '3RD', FOURTH: '4TH', FIFTH: '5TH', SIXTH: '6TH', SEVENTH: '7TH', EIGHTH: '8TH', NINTH: '9TH', TENTH: '10TH' };

export function normalizeStreet(s: string): string {
  const toks = s.toUpperCase().replace(/[.,#]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  return toks.map((t) => TYPE[t] ?? DIR[t] ?? ORD[t] ?? t).join(' ');
}

export function normalizeAddress(house: string, street: string): string {
  return `${house.trim().toUpperCase().replace(/^0+(?=\d)/, '')} ${normalizeStreet(street)}`.trim();
}

/** 16-char PIN, with or without dashes/spaces (e.g. 0175-G-00210-0000-00). Returns null if the text is not a PIN. */
export function parsePin(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, '');
  // block(4 digits) + map letter + lot(5 digits) + 6 more chars (digits, occasionally a letter, e.g. 0024B00340000A00)
  return /^\d{4}[A-Z]\d{5}[0-9A-Z]{6}$/.test(s) ? s : null;
}

export function splitAddress(input: string): { house: string; street: string } | null {
  const m = /^\s*(\d+[A-Za-z]?(?:\s*[-/]\s*\d+)?)\s+(.+?)\s*$/.exec(input);
  return m ? { house: m[1].replace(/\s+/g, ''), street: m[2] } : null;
}
