import { z } from 'zod';

export const Confidence = z.enum(['high', 'medium', 'low', 'unknown']);
export type Confidence = z.infer<typeof Confidence>;

/** Every fact the engine emits carries its provenance. Unknown data is never a pass. */
export const FactSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  source: z.string(),
  sourceUrl: z.string(),
  retrievedAt: z.string(),
  confidence: Confidence,
  reviewBy: z.string().nullable(),
});
export type Fact = z.infer<typeof FactSchema>;

export type Pos = number[];
export type PolygonGeom = { type: 'Polygon'; coordinates: Pos[][] };
export type MultiPolygonGeom = { type: 'MultiPolygon'; coordinates: Pos[][][] };
export type Geom = PolygonGeom | MultiPolygonGeom;

export const OwnerTypes = ['City', 'County', 'HACP', 'URA', 'Private', 'Other'] as const;
export type OwnerType = (typeof OwnerTypes)[number];

/** Owner NAMES are never stored anywhere; only the owner type. */
export const ProcessedParcelSchema = z.object({
  pin: z.string(),
  house: z.string(),
  street: z.string(),
  address: z.string(),
  neighborhood: z.string().nullable(),
  classDesc: z.string().nullable(),
  useDesc: z.string().nullable(),
  ownerType: z.enum(OwnerTypes).nullable(),
  vacant: z.boolean().nullable(),
  lotAreaSqft: z.number().nullable(),
  lotAreaSource: z.string(),
  lotAreaAssessorSqft: z.number().nullable(),
  zoningDistrict: z.string().nullable(), // from base-zoning polygons (WPRDC), spatial join
  zoningShare: z.number().nullable(), // share of parcel inside that district (1 = whole parcel)
  zoningOther: z.array(z.string()), // other districts covering >5% of the parcel
  zoningParcelsPublic: z.string().nullable(), // ParcelsPublic.zon_new, for cross-check
  zoningAgrees: z.boolean().nullable(),
  assessment: z
    .object({
      landValue: z.number().nullable(),
      buildingValue: z.number().nullable(),
      totalValue: z.number().nullable(),
      saleDate: z.string().nullable(),
      salePrice: z.number().nullable(),
      saleDesc: z.string().nullable(),
      taxYear: z.number().nullable(),
      asOf: z.string().nullable(),
    })
    .nullable(),
  inCityLimits: z.boolean(),
  centroid: z.tuple([z.number(), z.number()]),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  geometry: z.any(),
});
export type ProcessedParcel = Omit<z.infer<typeof ProcessedParcelSchema>, 'geometry'> & { geometry: Geom };

export type LayerMeta = {
  key: string;
  status: 'ok' | 'unavailable';
  url: string;
  retrievedAt: string;
  count?: number;
  sourceUsed?: string;
  error?: string;
};
