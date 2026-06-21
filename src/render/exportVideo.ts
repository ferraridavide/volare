import {
  canEncodeVideo,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  type StreamTargetChunk,
} from 'mediabunny';

import {
  calculateSegmentDistanceMeters,
  calculateVariometerMps,
  interpolateFlight,
} from '@/domain/flight';
import { interpolateCameraSettings } from '@/domain/keyframes';
import { calculateFlightSecondsPerVideoSecond, getOutputDimensions } from '@/domain/settings';
import type { FlightTrack, ProjectSettings, RenderJob } from '@/domain/types';
import type { CesiumFlightScene } from '@/scene/CesiumFlightScene';

import { paintStatsOverlay, paintWatermark } from './overlayPainter';
import { buildFrameSchedule, isAbortError, waitForTilesWithRetry } from './renderUtils';

export interface VideoExportOptions {
  scene: CesiumFlightScene;
  track: FlightTrack;
  settings: ProjectSettings;
  signal: AbortSignal;
  onProgress: (job: RenderJob) => void;
}

export async function exportFlightVideo(options: VideoExportOptions): Promise<void> {
  runSynchronousPreflight(options);
  const fileHandlePromise = window.showSaveFilePicker!({
    suggestedName: createOutputFileName(options.track),
    types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }],
  });
  const fileHandle = await fileHandlePromise;
  const dimensions = getOutputDimensions(
    options.settings.outputPreset,
    options.settings.aspectRatio,
  );
  await runAsynchronousPreflight(options, dimensions.width, dimensions.height);
  const writable = await fileHandle.createWritable();
  const target = new StreamTarget(writable as unknown as WritableStream<StreamTargetChunk>, {
    chunked: true,
    chunkSize: 16 * 1024 * 1024,
  });
  const schedule = buildFrameSchedule(options.settings);
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'reserve' }), target });
  const canvas = createExportCanvas(dimensions.width, dimensions.height);
  const source = new CanvasSource(canvas, {
    codec: 'avc',
    bitrate: Math.round(options.settings.bitrateMbps * 1_000_000),
    bitrateMode: 'variable',
    latencyMode: 'quality',
    hardwareAcceleration: 'no-preference',
    keyFrameInterval: 2,
  });
  output.addVideoTrack(source, {
    frameRate: options.settings.frameRate,
    maximumPacketCount: schedule.length,
  });

  const startedAt = performance.now();
  let completedFrames = 0;
  let succeeded = false;

  options.scene.enterExportMode(dimensions);
  try {
    await output.start();
    for (const frame of schedule) {
      throwIfAborted(options.signal);
      options.scene.updateAtTime(frame.flightSeconds, options.settings);
      await loadFrameTiles(
        options,
        frame.flightSeconds,
        completedFrames,
        schedule.length,
        startedAt,
      );
      compositeFrame(canvas, options.scene, options.track, options.settings, frame.flightSeconds);
      await source.add(frame.videoSeconds, frame.durationSeconds);
      completedFrames += 1;
      reportProgress(
        options,
        'rendering',
        completedFrames,
        schedule.length,
        frame.flightSeconds,
        'Encoded',
        startedAt,
      );
    }
    reportProgress(
      options,
      'finalizing',
      completedFrames,
      schedule.length,
      options.settings.trimEndSeconds,
      'Finalizing MP4',
      startedAt,
    );
    await output.finalize();
    succeeded = true;
    reportProgress(
      options,
      'completed',
      completedFrames,
      schedule.length,
      options.settings.trimEndSeconds,
      'Saved',
      startedAt,
    );
  } catch (error) {
    if (output.state !== 'canceled' && output.state !== 'finalized') await output.cancel();
    if (isAbortError(error)) {
      reportProgress(
        options,
        'canceled',
        completedFrames,
        schedule.length,
        0,
        'Canceled',
        startedAt,
      );
      return;
    }
    throw error;
  } finally {
    options.scene.exitExportMode();
    if (!succeeded && output.state !== 'canceled' && output.state !== 'finalized')
      await output.cancel();
  }
}

async function loadFrameTiles(
  options: VideoExportOptions,
  flightSeconds: number,
  completedFrames: number,
  totalFrames: number,
  startedAt: number,
): Promise<void> {
  await waitForTilesWithRetry(
    () =>
      options.scene.waitForTiles({
        timeoutMs: 30_000,
        stableFrames: 2,
        signal: options.signal,
        onStatus: (tileStatus) =>
          reportProgress(
            options,
            'rendering',
            completedFrames,
            totalFrames,
            flightSeconds,
            tileStatus,
            startedAt,
          ),
      }),
    2,
    options.signal,
  );
  const camera = interpolateCameraSettings(
    options.settings.camera,
    options.settings.cameraKeyframes,
    flightSeconds,
  );
  const cameraMoved = options.scene.ensureTerrainClearance(
    camera.minimumTerrainClearanceMeters,
    camera.fieldOfViewDegrees,
  );
  if (cameraMoved) {
    await options.scene.waitForTiles({
      timeoutMs: 30_000,
      stableFrames: 2,
      signal: options.signal,
    });
  }
}

function compositeFrame(
  canvas: HTMLCanvasElement,
  scene: CesiumFlightScene,
  track: FlightTrack,
  settings: ProjectSettings,
  flightSeconds: number,
): void {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Could not create the 2D export canvas context.');
  context.drawImage(scene.viewer.canvas, 0, 0, canvas.width, canvas.height);
  const fix = interpolateFlight(track, flightSeconds);
  const segmentDistance = calculateSegmentDistanceMeters(
    track,
    flightSeconds,
    settings.trimStartSeconds,
  );
  const variometer = calculateVariometerMps(
    track,
    flightSeconds,
    settings.overlay.variometerUpdateRateSeconds * calculateFlightSecondsPerVideoSecond(settings),
    settings.trimStartSeconds,
  );
  paintStatsOverlay(context, canvas, fix, segmentDistance, variometer, settings);
  paintWatermark(context, canvas, settings);
}

function runSynchronousPreflight(options: VideoExportOptions): void {
  if (!window.isSecureContext)
    throw new Error('MP4 export requires localhost or an HTTPS connection.');
  if (!window.showSaveFilePicker)
    throw new Error('MP4 export requires current desktop Chrome or Edge.');
  if (typeof VideoEncoder === 'undefined')
    throw new Error('This browser does not provide WebCodecs VideoEncoder.');
  const dimensions = getOutputDimensions(
    options.settings.outputPreset,
    options.settings.aspectRatio,
  );
  const maximumSize = options.scene.getMaximumRenderbufferSize();
  if (maximumSize && Math.max(dimensions.width, dimensions.height) > maximumSize) {
    throw new Error(
      `${dimensions.width}×${dimensions.height} exceeds this GPU's ${maximumSize}px render limit.`,
    );
  }
}

async function runAsynchronousPreflight(
  options: VideoExportOptions,
  width: number,
  height: number,
): Promise<void> {
  reportProgress(options, 'preflight', 0, 0, 0, 'Checking H.264 encoder', performance.now());
  const supported = await canEncodeVideo('avc', {
    width,
    height,
    bitrate: Math.round(options.settings.bitrateMbps * 1_000_000),
    latencyMode: 'quality',
  });
  if (!supported)
    throw new Error(`H.264 encoding at ${width}×${height} is not supported by this browser.`);
}

function reportProgress(
  options: VideoExportOptions,
  status: RenderJob['status'],
  completedFrames: number,
  totalFrames: number,
  currentFlightSeconds: number,
  tileStatus: string,
  startedAt: number,
): void {
  options.onProgress({
    status,
    completedFrames,
    totalFrames,
    currentFlightSeconds,
    tileStatus,
    elapsedSeconds: (performance.now() - startedAt) / 1000,
    error: null,
  });
}

function createExportCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function createOutputFileName(track: FlightTrack): string {
  const name = track.metadata.fileName.replace(/\.igc$/i, '').replace(/[^a-z0-9_-]+/gi, '-');
  return `${name || 'volare-flight'}-cinematic.mp4`;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Render canceled.', 'AbortError');
}
