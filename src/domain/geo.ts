const EARTH_RADIUS_METERS = 6_371_008.8;
const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;

export interface GeographicPoint {
  latitudeDegrees: number;
  longitudeDegrees: number;
}

export function calculateDistanceMeters(a: GeographicPoint, b: GeographicPoint): number {
  const latitudeDelta = (b.latitudeDegrees - a.latitudeDegrees) * DEGREES_TO_RADIANS;
  const longitudeDelta = (b.longitudeDegrees - a.longitudeDegrees) * DEGREES_TO_RADIANS;
  const latitudeA = a.latitudeDegrees * DEGREES_TO_RADIANS;
  const latitudeB = b.latitudeDegrees * DEGREES_TO_RADIANS;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export function calculateBearingDegrees(a: GeographicPoint, b: GeographicPoint): number {
  const latitudeA = a.latitudeDegrees * DEGREES_TO_RADIANS;
  const latitudeB = b.latitudeDegrees * DEGREES_TO_RADIANS;
  const longitudeDelta = (b.longitudeDegrees - a.longitudeDegrees) * DEGREES_TO_RADIANS;
  const y = Math.sin(longitudeDelta) * Math.cos(latitudeB);
  const x =
    Math.cos(latitudeA) * Math.sin(latitudeB) -
    Math.sin(latitudeA) * Math.cos(latitudeB) * Math.cos(longitudeDelta);
  return normalizeDegrees(Math.atan2(y, x) * RADIANS_TO_DEGREES);
}

export function offsetPoint(
  origin: GeographicPoint,
  eastMeters: number,
  northMeters: number,
): GeographicPoint {
  const latitudeRadians = origin.latitudeDegrees * DEGREES_TO_RADIANS;
  const latitudeOffset = northMeters / EARTH_RADIUS_METERS;
  const longitudeOffset = eastMeters / (EARTH_RADIUS_METERS * Math.cos(latitudeRadians));
  return {
    latitudeDegrees: origin.latitudeDegrees + latitudeOffset * RADIANS_TO_DEGREES,
    longitudeDegrees: origin.longitudeDegrees + longitudeOffset * RADIANS_TO_DEGREES,
  };
}

export function interpolateLongitude(a: number, b: number, fraction: number): number {
  let delta = b - a;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return normalizeLongitude(a + delta * fraction);
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function normalizeLongitude(value: number): number {
  return ((value + 540) % 360) - 180;
}
