import { useCallback, useEffect, useState } from 'react';
import { fetchArchive, fetchLatest } from './api';
import { AgentStatus } from './components/AgentStatus';
import { ArchiveStrip } from './components/ArchiveStrip';
import { CapsuleHero } from './components/CapsuleHero';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { HowItWorks } from './components/HowItWorks';
import { LoadingState, WaitingState } from './components/States';
import type { ArchiveEntry, Capsule } from './types';

type Status = 'loading' | 'ready' | 'unavailable';

export default function App() {
  const [status, setStatus] = useState<Status>('loading');
  const [capsule, setCapsule] = useState<Capsule | null>(null);
  const [archive, setArchive] = useState<ArchiveEntry[]>([]);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      // The archive is decorative and resolves to [] on failure, so only the
      // capsule decides whether the page has content.
      const [latest, entries] = await Promise.all([fetchLatest(), fetchArchive()]);
      setCapsule(latest);
      setArchive(entries);
      setStatus('ready');
    } catch (err) {
      console.error('Could not load the latest capsule', err);
      setStatus('unavailable');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen">
      <Header />

      <main>
        <Hero />

        {status === 'loading' && <LoadingState />}
        {status === 'unavailable' && <WaitingState onRetry={() => void load()} />}

        {status === 'ready' && capsule && (
          <>
            <CapsuleHero capsule={capsule} />
            <AgentStatus capsule={capsule} />
            <HowItWorks />
            <ArchiveStrip entries={archive} currentDate={capsule.date} />
          </>
        )}

        {status !== 'ready' && <HowItWorks />}
      </main>

      <Footer />
    </div>
  );
}
