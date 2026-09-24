import { listCoverage } from '@/lib/coverage/store';
import { capabilityStatus } from '@/lib/market';
import CoverageGrid from './CoverageGrid';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Coverage' };

export default async function DashboardPage() {
  const [names, capabilities] = await Promise.all([
    listCoverage(),
    Promise.resolve(capabilityStatus()),
  ]);
  return <CoverageGrid names={names} capabilities={capabilities} />;
}
