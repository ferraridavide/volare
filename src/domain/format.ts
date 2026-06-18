import type { UnitSystem } from './types';

const METERS_TO_FEET = 3.28084;
const METERS_PER_SECOND_TO_MILES_PER_HOUR = 2.23694;
const METERS_TO_MILES = 0.000621371;

export function formatAltitude(meters: number, units: UnitSystem): string {
  return units === 'metric'
    ? `${Math.round(meters).toLocaleString()} m`
    : `${Math.round(meters * METERS_TO_FEET).toLocaleString()} ft`;
}

export function formatSpeed(metersPerSecond: number, units: UnitSystem): string {
  return units === 'metric'
    ? `${Math.round(metersPerSecond * 3.6)} km/h`
    : `${Math.round(metersPerSecond * METERS_PER_SECOND_TO_MILES_PER_HOUR)} mph`;
}

export function formatDistance(meters: number, units: UnitSystem): string {
  return units === 'metric'
    ? `${(meters / 1000).toFixed(1)} km`
    : `${(meters * METERS_TO_MILES).toFixed(1)} mi`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '00:00';
  const roundedSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const remainingSeconds = roundedSeconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

export function formatFlightTime(seconds: number): string {
  const wholeMinutes = Math.floor(Math.max(0, Number.isFinite(seconds) ? seconds : 0) / 60);
  const hours = Math.floor(wholeMinutes / 60);
  const minutes = wholeMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
