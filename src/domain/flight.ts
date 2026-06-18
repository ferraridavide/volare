import { interpolateLongitude } from './geo';
import type { FlightTrack, InterpolatedFix } from './types';

export interface TrackDistancePosition {
  lowerIndex: number;
  fraction: number;
}

export function interpolateFlight(
  track: FlightTrack,
  elapsedSeconds: number,
  altitudeOffsetMeters = 0,
): InterpolatedFix {
  const clampedTime = Math.max(0, Math.min(track.durationSeconds, elapsedSeconds));
  const lowerIndex = findLowerFixIndex(track, clampedTime);
  const lower = track.fixes[lowerIndex]!;
  const upper = track.fixes[Math.min(lowerIndex + 1, track.fixes.length - 1)]!;
  const segmentDuration = upper.elapsedSeconds - lower.elapsedSeconds;
  const fraction = segmentDuration > 0 ? (clampedTime - lower.elapsedSeconds) / segmentDuration : 0;

  return {
    timestampMs: interpolate(lower.timestampMs, upper.timestampMs, fraction),
    elapsedSeconds: clampedTime,
    latitudeDegrees: interpolate(lower.latitudeDegrees, upper.latitudeDegrees, fraction),
    longitudeDegrees: interpolateLongitude(
      lower.longitudeDegrees,
      upper.longitudeDegrees,
      fraction,
    ),
    gnssAltitudeMeters: interpolateNullable(
      lower.gnssAltitudeMeters,
      upper.gnssAltitudeMeters,
      fraction,
    ),
    pressureAltitudeMeters: interpolateNullable(
      lower.pressureAltitudeMeters,
      upper.pressureAltitudeMeters,
      fraction,
    ),
    altitudeMeters:
      interpolate(lower.altitudeMeters, upper.altitudeMeters, fraction) + altitudeOffsetMeters,
    groundSpeedMps: interpolate(lower.groundSpeedMps, upper.groundSpeedMps, fraction),
    cumulativeDistanceMeters: interpolate(
      lower.cumulativeDistanceMeters,
      upper.cumulativeDistanceMeters,
      fraction,
    ),
    valid: true,
    sourceIndex: lowerIndex,
  };
}

export function calculateSegmentDistanceMeters(
  track: FlightTrack,
  currentSeconds: number,
  trimStartSeconds: number,
): number {
  const current = interpolateFlight(track, currentSeconds);
  const start = interpolateFlight(track, trimStartSeconds);
  return Math.max(0, current.cumulativeDistanceMeters - start.cumulativeDistanceMeters);
}

export function locateTrackDistance(
  track: FlightTrack,
  distanceMeters: number,
): TrackDistancePosition {
  const targetDistance = Math.max(0, Math.min(track.totalDistanceMeters, distanceMeters));
  let low = 0;
  let high = track.fixes.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (track.fixes[middle]!.cumulativeDistanceMeters <= targetDistance) low = middle;
    else high = middle - 1;
  }
  const lowerIndex = Math.min(low, track.fixes.length - 2);
  const lowerDistance = track.fixes[lowerIndex]!.cumulativeDistanceMeters;
  const upperDistance = track.fixes[lowerIndex + 1]!.cumulativeDistanceMeters;
  const segmentDistance = upperDistance - lowerDistance;
  const fraction = segmentDistance > 0 ? (targetDistance - lowerDistance) / segmentDistance : 0;
  return { lowerIndex, fraction: Math.max(0, Math.min(1, fraction)) };
}

function findLowerFixIndex(track: FlightTrack, elapsedSeconds: number): number {
  let low = 0;
  let high = track.fixes.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (track.fixes[middle]!.elapsedSeconds <= elapsedSeconds) low = middle;
    else high = middle - 1;
  }
  return Math.min(low, track.fixes.length - 2);
}

function interpolate(a: number, b: number, fraction: number): number {
  return a + (b - a) * fraction;
}

function interpolateNullable(a: number | null, b: number | null, fraction: number): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return interpolate(a, b, fraction);
}
