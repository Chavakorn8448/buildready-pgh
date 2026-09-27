/**
 * Settings for the financial snapshot. Everything an expert might want to change lives here (not in components):
 * which inputs the calculator asks for, optional threshold checks, weight presets, and how sale types are described.
 * Nothing here is a market estimate: the calculator only works on numbers the USER types.
 */
export type FieldDef = { id: string; label: string; unit: string; help: string; step?: number; modes?: ('rent' | 'sale')[]; group: 'site' | 'cost' | 'income' | 'debt' };

export const FIELDS: FieldDef[] = [
  { id: 'landCost', label: 'Land cost', unit: '$', help: 'What you would pay for the lot. The assessed land value is only a rough starting point, not a price.', group: 'site', step: 1000 },
  { id: 'units', label: 'Homes planned', unit: 'homes', help: 'How many dwelling units you plan to build. Zoning allowances are shown above; unit counts also depend on setbacks and height, which this tool does not check.', group: 'site', step: 1 },
  { id: 'unitSqft', label: 'Average home size', unit: 'sq ft', help: 'Finished living area per home.', group: 'site', step: 50 },
  { id: 'costPerSqft', label: 'Construction cost', unit: '$/sq ft', help: 'Your all-in hard-cost estimate per sq ft (from a builder quote or your own estimate).', group: 'cost', step: 5 },
  { id: 'softPct', label: 'Soft costs and contingency', unit: '% of construction', help: 'Design, permits, financing fees, contingency, developer fee, as a percent of construction cost.', group: 'cost', step: 1 },
  { id: 'rentPerUnitMonth', label: 'Rent per home', unit: '$/month', help: 'Expected monthly rent per home.', group: 'income', step: 25, modes: ['rent'] },
  { id: 'opexPct', label: 'Operating costs and vacancy', unit: '% of rent', help: 'Taxes, insurance, maintenance, management and vacancy as a percent of gross rent.', group: 'income', step: 1, modes: ['rent'] },
  { id: 'capRatePct', label: 'Capitalization rate', unit: '%', help: 'Converts yearly net income into a supportable value (value = net income ÷ cap rate). Use the rate your lender or appraiser uses.', group: 'income', step: 0.25, modes: ['rent'] },
  { id: 'salePricePerUnit', label: 'Sale price per home', unit: '$', help: 'Expected sale price of each finished home, net of selling costs.', group: 'income', step: 5000, modes: ['sale'] },
  { id: 'loanPct', label: 'Loan as share of total cost', unit: '%', help: 'Optional. Fill in the three debt boxes to see a coverage ratio.', group: 'debt', step: 5, modes: ['rent'] },
  { id: 'ratePct', label: 'Interest rate', unit: '%', help: 'Optional. Yearly interest rate on the loan.', group: 'debt', step: 0.25, modes: ['rent'] },
  { id: 'termYears', label: 'Loan term', unit: 'years', help: 'Optional. Amortization period.', group: 'debt', step: 1, modes: ['rent'] },
];

/**
 * Coverage threshold, shown as a clear pass/fail line under the ratio (a housing-finance expert we consulted said the
 * threshold choice is ours to make, as long as it is presented clearly). 1.20 is a commonly cited lender rule of thumb
 * for small residential income properties (some agency programs use other minimums, e.g. PHFA's multifamily
 * guidelines have cited 1.15 in some years) — treat it as a rule of thumb, not a specific lender's or program's
 * requirement, and confirm the real minimum with your lender or PHFA. Set to null to show the ratio only, no pass/fail.
 */
export const THRESHOLDS: { dscrMin: number | null; dscrLabel: string } = {
  dscrMin: 1.2,
  dscrLabel: 'common lender rule of thumb, not a specific loan\'s requirement — confirm with your lender or PHFA',
};

/** Weight presets. "Default" is the scoring model's own weights (lib/config.ts). Funding fit is currently a neighborhood-value proxy, not a full pro forma. */
export const PRESETS: { id: string; label: string; blurb: string; weights: { zoning: number; environmental: number; funding: number; access: number; site: number } }[] = [
  { id: 'default', label: 'Default', blurb: 'Balanced (the model’s own weights).', weights: { zoning: 40, environmental: 20, funding: 15, access: 15, site: 10 } },
  { id: 'zoning-financial', label: 'Zoning & financial first', blurb: 'For developers: what the zoning allows and what the deal looks like matter most.', weights: { zoning: 45, environmental: 15, funding: 25, access: 10, site: 5 } },
  { id: 'public-land', label: 'Public land / nonprofit', blurb: 'For nonprofits and land bank staff: ownership and financing weigh more.', weights: { zoning: 35, environmental: 15, funding: 20, access: 10, site: 20 } },
];

/** Assessor sale types that usually reflect an arm's-length price. Others are shown with their type and a caution. */
export const MARKET_LIKE_SALE_TYPES = ['VALID SALE'];

/** How many bedrooms each "homes planned" size roughly corresponds to, for suggesting a HUD rent figure (rough mapping by sq ft; the user should still pick the closest fit). */
export const SQFT_TO_BEDROOMS: { maxSqft: number; label: string; key: '0BR' | '1BR' | '2BR' | '3BR' | '4BR' }[] = [
  { maxSqft: 550, label: 'studio', key: '0BR' },
  { maxSqft: 800, label: '1BR', key: '1BR' },
  { maxSqft: 1100, label: '2BR', key: '2BR' },
  { maxSqft: 1500, label: '3BR', key: '3BR' },
  { maxSqft: Infinity, label: '4BR+', key: '4BR' },
];
