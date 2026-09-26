import CompareView from '@/components/CompareView';
import { getMeta, getPacket } from '@/lib/web/server-data';
import { parsePin } from '@/lib/lookup';

export const metadata = { title: 'Compare parcels · BuildReady PGH' };

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids } = await searchParams;
  const pins = (ids ?? '').split(',').map((s) => parsePin(s.trim()) ?? s.trim().toUpperCase()).filter(Boolean).slice(0, 5);
  const items = pins.flatMap((pin) => { const f = getPacket(pin); return f ? [{ pin, hood: f.hood, packet: f.packet }] : []; });
  return <CompareView items={items} meta={getMeta()} />;
}
