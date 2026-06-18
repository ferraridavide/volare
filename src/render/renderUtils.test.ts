import { describe, expect, it, vi } from 'vitest';

import { createDefaultSettings } from '@/domain/settings';

import { buildFrameSchedule, waitForTilesWithRetry } from './renderUtils';

describe('render utilities', () => {
  it('builds stable frame timestamps and flight mappings', () => {
    const settings = createDefaultSettings(120);
    settings.targetDurationSeconds = 2;
    settings.frameRate = 30;
    settings.trimStartSeconds = 20;
    settings.trimEndSeconds = 80;

    const frames = buildFrameSchedule(settings);
    expect(frames).toHaveLength(60);
    expect(frames[0]).toMatchObject({ videoSeconds: 0, flightSeconds: 20 });
    expect(frames[30]).toMatchObject({ videoSeconds: 1, flightSeconds: 50 });
  });

  it('retries tile waits and eventually succeeds', async () => {
    const waiter = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce();
    await waitForTilesWithRetry(waiter, 2, new AbortController().signal);
    expect(waiter).toHaveBeenCalledTimes(2);
  });

  it('stops tile retries when canceled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      waitForTilesWithRetry(() => Promise.resolve(), 2, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
