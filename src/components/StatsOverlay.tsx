import { useMemo } from 'react';

import { formatAltitude, formatDistance, formatFlightTime, formatSpeed } from '@/domain/format';
import {
  calculateSegmentDistanceMeters,
  calculateSmoothedVariometerMps,
  calculateUpdatedSmoothedVariometerMps,
  calculateVariometerScaleMps,
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
  const averageWindowFlightSeconds =
    settings.overlay.variometerMeterAverageSeconds * calculateFlightSecondsPerVideoSecond(settings);
  const variometerScaleMps = useMemo(
    () => calculateVariometerScaleMps(track, averageWindowFlightSeconds),
    [track, averageWindowFlightSeconds],
  );
  const variometer = calculateSmoothedVariometerMps(
    track,
    flightSeconds,
    averageWindowFlightSeconds,
  );
  const updatedVariometer = calculateUpdatedSmoothedVariometerMps(
    track,
    flightSeconds,
    settings.overlay.variometerUpdateRateSeconds * calculateFlightSecondsPerVideoSecond(settings),
    averageWindowFlightSeconds,
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
              value={`${updatedVariometer >= 0 ? '+' : ''}${updatedVariometer.toFixed(2)} m/s`}
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
      {settings.overlay.enabled && settings.overlay.variometerGauge && (
        <VariometerMeter valueMps={variometer} scaleMps={variometerScaleMps} />
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

function VariometerMeter({ valueMps, scaleMps }: { valueMps: number; scaleMps: number }) {
  const clampedValue = Math.max(-scaleMps, Math.min(scaleMps, valueMps));
  const markerPosition = ((scaleMps - clampedValue) / (scaleMps * 2)) * 100;
  const levelStart = Math.min(50, markerPosition);
  const levelEnd = Math.max(50, markerPosition);
  const formattedValue = `${valueMps >= 0 ? '+' : ''}${valueMps.toFixed(1)}`;
  const formattedScale = scaleMps.toFixed(1);

  return (
    <div className="variometer-meter" aria-label={`Variometer meter ${formattedValue} m/s`}>
      <span className="variometer-meter__limit variometer-meter__limit--top">
        +{formattedScale}
      </span>
      <div className="variometer-meter__scale">
        <span
          className="variometer-meter__level"
          style={{ clipPath: `inset(${levelStart}% 0 ${100 - levelEnd}% 0)` }}
        />
        <span className="variometer-meter__zero" />
      </div>
      <div className="variometer-meter__value">
        <strong>{formattedValue}</strong>
        <span>m/s</span>
      </div>
      <span className="variometer-meter__limit variometer-meter__limit--bottom">
        -{formattedScale}
      </span>
    </div>
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
