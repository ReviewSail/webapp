import { useState } from 'react';

export type ScheduleMode = 'legacy' | 'both' | 'arrival' | 'day2';
const options = [
  ['both', 'Arrival + Day 2'],
  ['arrival', 'Arrival only'],
  ['day2', 'Day 2 only'],
] as const;

function displayTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}

export function previewStay(
  mode: ScheduleMode,
  arrival: string,
  nights: number,
  legacyDay: number,
  legacyHour: number,
  timezone = 'UTC',
) {
  const [hour, minute] = arrival.split(':').map(Number);
  const due = hour * 60 + minute + 120;
  // In half-hour and quarter-hour zones the hourly worker runs off the local hour.
  const example = new Date();
  example.setUTCMinutes(0, 0, 0);
  let workerMinute = 0;
  try {
    workerMinute = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: timezone, minute: 'numeric' }).format(example),
    );
  } catch {
    /* A legacy property may still need a valid timezone. */
  }
  const nextRun = due + ((workerMinute - (due % 60) + 60) % 60);
  const nextDay = nextRun >= 20 * 60;
  const arrivalDay = nextDay ? 1 : 0;
  const events: string[] = [];
  if (mode === 'legacy') {
    if (legacyDay <= nights)
      events.push(`Day ${legacyDay} · ${displayTime(legacyHour * 60)} · Stay check-in`);
  } else {
    if (mode !== 'day2' && arrivalDay < nights) {
      events.push(
        `${nextDay ? 'Saturday' : 'Friday'} · ${displayTime(nextDay ? 540 : Math.max(540, due))} · Arrival check-in`,
      );
    }
    if (mode !== 'arrival' && nights > 1 && !(mode === 'both' && nextDay))
      events.push('Saturday · 12:00 PM · First-night follow-up');
  }
  return events;
}

type Props = {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  mode: ScheduleMode;
  setMode: (v: ScheduleMode) => void;
  arrival: string;
  setArrival: (v: string) => void;
  timezone: string;
  legacyDay: number;
  legacyHour: number;
};
export function CheckinSettings(p: Props) {
  const [nights, setNights] = useState(2);
  const events = p.enabled
    ? previewStay(p.mode, p.arrival, nights, p.legacyDay, p.legacyHour, p.timezone)
    : [];
  return (
    <section
      aria-label="Guest check-ins"
      className="space-y-4 rounded-xl border border-line bg-canvas p-4"
    >
      <label className="flex items-center gap-3 font-semibold">
        <input
          type="checkbox"
          checked={p.enabled}
          onChange={(e) => p.setEnabled(e.target.checked)}
        />
        Guest check-ins
      </label>
      {p.enabled && (
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm">When to check in</legend>
          {p.mode === 'legacy' && (
            <p className="text-sm">
              Current schedule · Day {p.legacyDay}. Choose a new schedule below to switch.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {options.map(([value, label]) => (
              <label
                key={value}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${p.mode === value ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line bg-card'}`}
              >
                <input
                  type="radio"
                  name="stay-schedule"
                  checked={p.mode === value}
                  onChange={() => p.setMode(value)}
                />
                {label}
              </label>
            ))}
          </div>
          {p.mode !== 'legacy' && (
            <label className="block text-sm">
              Usual check-in time
              <input
                type="time"
                value={p.arrival}
                onChange={(e) => e.target.value && p.setArrival(e.target.value)}
                className="ml-2 rounded border border-line bg-card px-2 py-2"
              />
            </label>
          )}
        </fieldset>
      )}
      <div className="rounded-lg border border-line bg-card p-3 text-sm">
        <label>
          Example Friday arrival ·{' '}
          <select
            aria-label="Example stay length"
            className="bg-card"
            value={nights}
            onChange={(e) => setNights(Number(e.target.value))}
          >
            <option value={1}>One night</option>
            <option value={2}>Two nights</option>
          </select>
        </label>
        <ul aria-live="polite" className="my-2 space-y-1 font-medium">
          {events.length ? (
            events.map((event) => <li key={event}>{event}</li>)
          ) : (
            <li>No scheduled check-in for this stay</li>
          )}
        </ul>
        <p className="text-xs text-ink-muted">
          Earliest send times in {p.timezone}. Messages go on the next scheduled run. A booking’s
          own arrival time takes precedence.
        </p>
      </div>
    </section>
  );
}
