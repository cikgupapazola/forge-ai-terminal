import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const provider = req.headers.get('x-provider') || 'OPENROUTER';
  const apiKey = req.headers.get('x-api-key');

  if (!apiKey) {
    return NextResponse.json({ error: 'API key is required to fetch models' }, { status: 400 });
  }

  try {
    if (provider === 'OPENROUTER') {
      const resp = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const json = await resp.json();
      return NextResponse.json(json.data.map((m: any) => ({ label: m.name || m.id, value: m.id })));
    } else {
      const resp = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const json = await resp.json();
      return NextResponse.json(json.data.map((m: any) => ({ label: m.id, value: m.id })));
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
