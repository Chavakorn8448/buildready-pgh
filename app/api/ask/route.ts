import { ask } from '@/lib/agent/run';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { question } = await req.json();
    if (typeof question !== 'string' || !question.trim()) return Response.json({ error: 'question required' }, { status: 400 });
    return Response.json(await ask(question));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
