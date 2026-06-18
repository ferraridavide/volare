import type { CameraKeyframe, CameraSettings } from './types';

const ANGLE_KEYS = new Set<keyof CameraSettings>(['headingOffsetDegrees', 'fixedHeadingDegrees']);

export function interpolateCameraSettings(
  baseCamera: CameraSettings,
  keyframes: CameraKeyframe[],
  flightSeconds: number,
): CameraSettings {
  if (keyframes.length === 0) return baseCamera;
  const sorted = [...keyframes].sort((a, b) => a.flightSeconds - b.flightSeconds);
  const nextIndex = sorted.findIndex((keyframe) => keyframe.flightSeconds >= flightSeconds);
  if (nextIndex === -1) return sorted.at(-1)!.camera;
  if (nextIndex === 0) return sorted[0]!.camera;

  const previous = sorted[nextIndex - 1]!;
  const next = sorted[nextIndex]!;
  const duration = next.flightSeconds - previous.flightSeconds;
  if (duration <= 0) return next.camera;
  const progress = (flightSeconds - previous.flightSeconds) / duration;
  const easedProgress = progress * progress * (3 - 2 * progress);
  return interpolateCamera(previous.camera, next.camera, easedProgress);
}

function interpolateCamera(
  previous: CameraSettings,
  next: CameraSettings,
  amount: number,
): CameraSettings {
  const result = { ...previous };
  for (const key of Object.keys(previous) as (keyof CameraSettings)[]) {
    const previousValue = previous[key];
    const nextValue = next[key];
    if (typeof previousValue === 'boolean' || typeof nextValue === 'boolean') {
      Object.assign(result, { [key]: amount < 0.5 ? previousValue : nextValue });
      continue;
    }
    const delta = ANGLE_KEYS.has(key)
      ? ((nextValue - previousValue + 540) % 360) - 180
      : nextValue - previousValue;
    Object.assign(result, { [key]: previousValue + delta * amount });
  }
  return result;
}
