import { Cartesian3 } from 'cesium';

import type { FlightTrack } from '@/domain/types';

export function smoothRoutePositions(
  positions: Cartesian3[],
  requestedPasses: number,
): Cartesian3[] {
  let smoothed = positions;
  const passes = Math.max(0, Math.min(8, Math.round(requestedPasses)));
  for (let pass = 0; pass < passes; pass += 1) smoothed = smoothRoutePass(smoothed);
  return smoothed;
}

export function interpolateRoutePosition(
  track: FlightTrack,
  positions: Cartesian3[],
  elapsedSeconds: number,
  lowerIndex: number,
): Cartesian3 {
  const upperIndex = Math.min(lowerIndex + 1, positions.length - 1);
  const lowerTime = track.fixes[lowerIndex]!.elapsedSeconds;
  const upperTime = track.fixes[upperIndex]!.elapsedSeconds;
  const duration = upperTime - lowerTime;
  const fraction = duration > 0 ? (elapsedSeconds - lowerTime) / duration : 0;
  return Cartesian3.lerp(
    positions[lowerIndex]!,
    positions[upperIndex]!,
    fraction,
    new Cartesian3(),
  );
}

function smoothRoutePass(positions: Cartesian3[]): Cartesian3[] {
  if (positions.length < 3) return positions;
  const result = [positions[0]!];
  for (let index = 1; index < positions.length - 1; index += 1) {
    result.push(calculateWeightedPosition(positions, index));
  }
  result.push(positions.at(-1)!);
  return result;
}

function calculateWeightedPosition(positions: Cartesian3[], index: number): Cartesian3 {
  const previous = Cartesian3.multiplyByScalar(positions[index - 1]!, 0.25, new Cartesian3());
  const current = Cartesian3.multiplyByScalar(positions[index]!, 0.5, new Cartesian3());
  const next = Cartesian3.multiplyByScalar(positions[index + 1]!, 0.25, new Cartesian3());
  return Cartesian3.add(Cartesian3.add(previous, current, current), next, current);
}
