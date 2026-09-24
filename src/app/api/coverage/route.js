import { NextResponse } from 'next/server';
import { listCoverage } from '@/lib/coverage/store';
import { capabilityStatus } from '@/lib/market';

export const dynamic = 'force-dynamic';

export async function GET() {
  const names = await listCoverage();
  return NextResponse.json({ names, capabilities: capabilityStatus() });
}
