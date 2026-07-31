import { useEffect, useState } from 'react';

export function TurnDuration({
  completedAtMs,
  startedAtMs,
  streaming,
}: {
  completedAtMs?: number;
  startedAtMs: number;
  streaming: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!streaming) return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [streaming]);

  const elapsed = formatElapsedTime(Math.max(0, (completedAtMs ?? now) - startedAtMs));

  return (
    <p className='mb-4 border-b pb-3 text-xs tabular-nums text-muted-foreground'>
      {streaming ? 'Working' : 'Worked'} for {elapsed}
    </p>
  );
}

const formatElapsedTime = (durationMs: number) => {
  const totalSeconds = Math.floor(durationMs / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};
