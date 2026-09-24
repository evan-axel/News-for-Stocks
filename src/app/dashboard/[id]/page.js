import { notFound } from 'next/navigation';
import { getCoverage } from '@/lib/coverage/store';
import NameView from './NameView';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const name = await getCoverage(params.id);
  return { title: name ? `${name.ticker} — ${name.name}` : 'Name' };
}

export default async function NamePage({ params }) {
  const coverage = await getCoverage(params.id);
  if (!coverage) notFound();
  return <NameView coverage={JSON.parse(JSON.stringify(coverage))} />;
}
