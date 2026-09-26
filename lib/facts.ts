import type { Confidence, Fact } from './types';

export type SourceRef = { source: string; sourceUrl: string; retrievedAt: string };

export function makeFact(
  id: string, label: string, value: Fact['value'], src: SourceRef, confidence: Confidence, reviewBy: string | null = null,
): Fact {
  return { id, label, value, source: src.source, sourceUrl: src.sourceUrl, retrievedAt: src.retrievedAt, confidence, reviewBy };
}

export type Flag = {
  id: string;
  text: string;
  severity: 'info' | 'warn' | 'block';
  reviewBy: string | null;
  /** Fact ids that support the flag (each fact carries its source URL). */
  factIds: string[];
  proposed?: boolean;
};
