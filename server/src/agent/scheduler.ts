import type { Autopilot, Cadence } from './types.js';

function cadenceMs(cadence: Cadence) {
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  switch (cadence.kind) {
    case 'hourly':
      return hour;
    case 'daily':
      return day;
    case 'weekday':
      return day;
    case 'weekly':
      return 7 * day;
    case 'custom':
      return (cadence.everyMinutes || 60) * minute;
    default:
      return day;
  }
}

function adjustedCadenceMs(cadence: Cadence) {
  const accel = Number(process.env.DEMO_TIME_ACCEL || 0);
  if (accel === 1) {
    if (cadence.kind === 'hourly') return 20_000;
    if (cadence.kind === 'custom') return Math.max(10_000, (cadence.everyMinutes || 1) * 5_000);
    return 60_000;
  }
  return cadenceMs(cadence);
}

export function startAutopilotScheduler({
  listAutopilots,
  onDueAutopilot,
}: {
  listAutopilots: () => Autopilot[];
  onDueAutopilot: (autopilot: Autopilot) => Promise<void> | void;
}) {
  const tickMs = Number(process.env.DEMO_TIME_ACCEL || 0) === 1 ? 5_000 : 30_000;
  const timer = setInterval(async () => {
    const now = Date.now();
    const autopilots = listAutopilots().filter((a) => a.enabled);
    for (const ap of autopilots) {
      const dueInMs = adjustedCadenceMs(ap.cadence);
      const last = ap.lastRunAt || 0;
      if (now - last >= dueInMs) {
        await onDueAutopilot(ap);
      }
    }
  }, tickMs);

  return () => clearInterval(timer);
}
