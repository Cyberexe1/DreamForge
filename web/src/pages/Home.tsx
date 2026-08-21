import { AgentStatus } from '../components/AgentStatus';
import { ArchiveStrip } from '../components/ArchiveStrip';
import { CapsuleHero } from '../components/CapsuleHero';
import { Hero } from '../components/Hero';
import { HowItWorks } from '../components/HowItWorks';
import { LoadingState, WaitingState } from '../components/States';
import { usePulseData } from '../lib/usePulseData';

export function Home() {
  const { status, capsule, archive, reload } = usePulseData();

  return (
    <>
      <Hero />

      {status === 'loading' && <LoadingState />}
      {status === 'unavailable' && <WaitingState onRetry={reload} />}

      {status === 'ready' && capsule && (
        <>
          <CapsuleHero capsule={capsule} />
          <AgentStatus capsule={capsule} />
          <HowItWorks />
          <ArchiveStrip entries={archive} currentDate={capsule.date} />
        </>
      )}

      {status !== 'ready' && <HowItWorks />}
    </>
  );
}
