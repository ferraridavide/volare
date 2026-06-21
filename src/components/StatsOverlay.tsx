import { formatAltitude, formatDistance, formatFlightTime, formatSpeed } from '@/domain/format';
import {
  calculateSegmentDistanceMeters,
  calculateVariometerMps,
  interpolateFlight,
} from '@/domain/flight';
import { calculateFlightSecondsPerVideoSecond } from '@/domain/settings';
import type { FlightTrack, ProjectSettings } from '@/domain/types';

interface StatsOverlayProps {
  track: FlightTrack;
  flightSeconds: number;
  settings: ProjectSettings;
}

export function StatsOverlay({ track, flightSeconds, settings }: StatsOverlayProps) {
  const fix = interpolateFlight(track, flightSeconds);
  const distance = calculateSegmentDistanceMeters(track, flightSeconds, settings.trimStartSeconds);
  const flightSecondsPerVideoSecond = calculateFlightSecondsPerVideoSecond(settings);
  const variometer = calculateVariometerMps(
    track,
    flightSeconds,
    settings.overlay.variometerUpdateRateSeconds * flightSecondsPerVideoSecond,
    settings.trimStartSeconds,
  );

  return (
    <>
      {settings.overlay.enabled && (
        <div
          className="stats-overlay"
          aria-label="Flight statistics"
          style={{
            backgroundColor: withOpacity(
              settings.overlay.backgroundColor,
              settings.overlay.backgroundOpacity,
            ),
          }}
        >
          {settings.overlay.altitude && (
            <Stat
              label="Altitude"
              value={formatAltitude(fix.altitudeMeters, settings.unitSystem)}
            />
          )}
          {settings.overlay.speed && (
            <Stat label="Speed" value={formatSpeed(fix.groundSpeedMps, settings.unitSystem)} />
          )}
          {settings.overlay.variometer && (
            <Stat
              label="Vario"
              value={`${variometer >= 0 ? '+' : ''}${variometer.toFixed(2)} m/s`}
            />
          )}
          {settings.overlay.distance && (
            <Stat label="Distance" value={formatDistance(distance, settings.unitSystem)} />
          )}
          {settings.overlay.time && (
            <Stat label="Time" value={formatFlightTime(fix.elapsedSeconds)} />
          )}
        </div>
      )}
      {settings.overlay.watermark && (
        <a
          className="volare-watermark"
          href="https://volare.davide.im"
          target="_blank"
          rel="noreferrer"
        >
          volare.davide.im
        </a>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-row">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function withOpacity(color: string, opacity: number): string {
  const alpha = Math.round(Math.min(1, Math.max(0, opacity)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${color}${alpha}`;
}
