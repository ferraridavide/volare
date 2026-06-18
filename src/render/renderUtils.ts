import { mapVideoTimeToFlightTime } from '@/domain/settings';
import type { ProjectSettings } from '@/domain/types';

export interface ScheduledFrame {
  frameIndex: number;
  videoSeconds: number;
  flightSeconds: number;
  durationSeconds: number;
}

export function buildFrameSchedule(settings: ProjectSettings): ScheduledFrame[] {
  const totalFrames = Math.ceil(settings.targetDurationSeconds * settings.frameRate);
  const durationSeconds = 1 / settings.frameRate;
  return Array.from({ length: totalFrames }, (_, frameIndex) => {
    const videoSeconds = frameIndex / settings.frameRate;
    return {
      frameIndex,
      videoSeconds,
      flightSeconds: mapVideoTimeToFlightTime(videoSeconds, settings),
      durationSeconds,
    };
  });
}

export async function waitForTilesWithRetry(
  waiter: () => Promise<void>,
  retryCount: number,
  signal: AbortSignal,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    if (signal.aborted) throw new DOMException('Render canceled.', 'AbortError');
    try {
      await waiter();
      return;
    } catch (error) {
      if (isAbortError(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
