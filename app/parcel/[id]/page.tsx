import Link from 'next/link';
import { notFound } from 'next/navigation';
import ParcelView, { type AiEntry } from '@/components/ParcelView';
import { getAiCache, getMeta, getPacket } from '@/lib/web/server-data';
import { parsePin } from '@/lib/lookup';
import type { RuleSetId } from '@/lib/web/run';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Parcel ${id} · BuildReady PGH` };
}

export default async function ParcelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pin = parsePin(decodeURIComponent(id)) ?? id.toUpperCase();
  const found = getPacket(pin);
  if (!found) {
    return (
      <main className="mx-auto max-w-xl px-5 py-24 text-center">
        <h1 className="text-2xl font-semibold">Parcel not in the snapshot</h1>
        <p className="mt-3 text-muted">{pin} is not in the City of Pittsburgh parcel snapshot. Check the parcel ID or search by address. Parcels outside the City (or created after the 2026-09-26 snapshot) are not covered.</p>
        <Link href="/" className="btn mt-6 inline-block">Back to search</Link>
      </main>
    );
  }
  const ai: Partial<Record<RuleSetId, AiEntry>> = {};
  for (const rs of ['current', 'reform-2025-1545'] as RuleSetId[]) { const c = getAiCache(pin, rs); if (c) ai[rs] = c as AiEntry; }
  return <ParcelView packet={found.packet} meta={getMeta()} hood={found.hood} ai={ai} />;
}
