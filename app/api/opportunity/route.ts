import { getOpportunity } from '@/lib/web/server-data';

export async function GET() {
  return new Response(getOpportunity(), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' } });
}
