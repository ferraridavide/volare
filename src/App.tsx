import { useCallback, useEffect, useRef, useState } from 'react';

import { CesiumViewport, type CesiumViewportHandle } from '@/components/CesiumViewport';
import { ExportProgress } from '@/components/ExportProgress';
import { Modal } from '@/components/Modal';
import { SettingsPanel } from '@/components/SettingsPanel';
import { Timeline } from '@/components/Timeline';
import { formatDuration } from '@/domain/format';
import { parseIgc } from '@/domain/igc';
import { interpolateCameraSettings } from '@/domain/keyframes';
import { sanitizeSettings } from '@/domain/settings';
import { loadSettingsPreset, saveSettingsPreset } from '@/domain/settingsStorage';
import type { CameraSettings, FlightTrack, ProjectSettings, RenderJob } from '@/domain/types';
import { exportFlightVideo } from '@/render/exportVideo';
import { isAbortError } from '@/render/renderUtils';

const TOKEN_STORAGE_KEY = 'paraglider-render:cesium-ion-token';
const MAX_IGC_BYTES = 50 * 1024 * 1024;

const IDLE_RENDER_JOB: RenderJob = {
  status: 'idle',
  completedFrames: 0,
  totalFrames: 0,
  currentFlightSeconds: 0,
  tileStatus: '',
  elapsedSeconds: 0,
  error: null,
};

export default function App() {
  const [track, setTrack] = useState<FlightTrack | null>(null);
  const [settings, setSettings] = useState<ProjectSettings>(loadSettingsPreset);
  const [flightSeconds, setFlightSeconds] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);
  const [ionToken, setIonToken] = useState(loadInitialToken);
  const [tokenDraft, setTokenDraft] = useState(loadInitialToken);
  const [message, setMessage] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<'settings' | 'render' | 'watermark' | null>(null);
  const [renderJob, setRenderJob] = useState<RenderJob>(IDLE_RENDER_JOB);
  const viewportRef = useRef<CesiumViewportHandle>(null);
  const renderAbortRef = useRef<AbortController | null>(null);
  const isRendering = ['preflight', 'rendering', 'finalizing'].includes(renderJob.status);

  const handleSceneError = useCallback((errorMessage: string) => setMessage(errorMessage), []);

  useEffect(() => {
    saveSettingsPreset(settings);
  }, [settings]);

  useEffect(() => {
    if (!playing || !track) return;
    let animationFrame = 0;
    let previousTime = performance.now();
    const flightRate =
      (settings.trimEndSeconds - settings.trimStartSeconds) / settings.targetDurationSeconds;

    const tick = (time: number) => {
      const elapsedRealSeconds = (time - previousTime) / 1000;
      previousTime = time;
      setFlightSeconds((current) => {
        const next = current + elapsedRealSeconds * flightRate;
        if (next < settings.trimEndSeconds) return next;
        setPlaying(false);
        return settings.trimEndSeconds;
      });
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [
    playing,
    track,
    settings.trimStartSeconds,
    settings.trimEndSeconds,
    settings.targetDurationSeconds,
  ]);

  const loadFlightFile = async (file: File) => {
    setPlaying(false);
    setMessage(null);
    try {
      if (file.size > MAX_IGC_BYTES) {
        throw new Error(`IGC file "${file.name}" is larger than the 50 MB browser limit.`);
      }
      const parsedTrack = parseIgc(await file.text(), file.name);
      setTrack(parsedTrack);
      setSettings((currentSettings) =>
        fitSettingsToFlight(
          { ...currentSettings, cameraKeyframes: [] },
          parsedTrack.durationSeconds,
        ),
      );
      setSelectedKeyframeId(null);
      setFlightSeconds(0);
      setRenderJob(IDLE_RENDER_JOB);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Could not read "${file.name}".`);
    }
  };

  const saveToken = () => {
    const token = tokenDraft.trim();
    setIonToken(token);
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
    setActiveModal(null);
  };

  const updateSettings = (nextSettings: ProjectSettings) => {
    const sanitized = sanitizeSettings(nextSettings, track?.durationSeconds ?? 0);
    setSettings(sanitized);
    setFlightSeconds((seconds) =>
      Math.min(sanitized.trimEndSeconds, Math.max(sanitized.trimStartSeconds, seconds)),
    );
  };

  const updateTrim = (trimStartSeconds: number, trimEndSeconds: number) => {
    updateSettings({ ...settings, trimStartSeconds, trimEndSeconds });
  };

  const requestWatermarkChange = (enabled: boolean) => {
    if (!enabled && settings.overlay.watermark) {
      setActiveModal('watermark');
      return;
    }
    updateSettings({ ...settings, overlay: { ...settings.overlay, watermark: enabled } });
  };

  const selectedKeyframe =
    settings.cameraKeyframes.find((keyframe) => keyframe.id === selectedKeyframeId) ?? null;
  const displayedCamera = selectedKeyframe
    ? selectedKeyframe.camera
    : interpolateCameraSettings(settings.camera, settings.cameraKeyframes, flightSeconds);

  const updateCamera = (camera: CameraSettings) => {
    if (!selectedKeyframeId) {
      updateSettings({ ...settings, camera });
      return;
    }
    updateSettings({
      ...settings,
      cameraKeyframes: settings.cameraKeyframes.map((keyframe) =>
        keyframe.id === selectedKeyframeId ? { ...keyframe, camera } : keyframe,
      ),
    });
  };

  const addCameraKeyframe = () => {
    const id = `camera-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const camera = interpolateCameraSettings(
      settings.camera,
      settings.cameraKeyframes,
      flightSeconds,
    );
    updateSettings({
      ...settings,
      cameraKeyframes: [...settings.cameraKeyframes, { id, flightSeconds, camera }],
    });
    setSelectedKeyframeId(id);
  };

  const selectCameraKeyframe = (id: string) => {
    const keyframe = settings.cameraKeyframes.find((item) => item.id === id);
    if (!keyframe) return;
    setPlaying(false);
    setSelectedKeyframeId(id);
    setFlightSeconds(keyframe.flightSeconds);
  };

  const moveCameraKeyframe = (id: string, nextFlightSeconds: number) => {
    updateSettings({
      ...settings,
      cameraKeyframes: settings.cameraKeyframes.map((keyframe) =>
        keyframe.id === id ? { ...keyframe, flightSeconds: nextFlightSeconds } : keyframe,
      ),
    });
    if (id === selectedKeyframeId) setFlightSeconds(nextFlightSeconds);
  };

  const removeSelectedKeyframe = () => {
    if (!selectedKeyframeId) return;
    updateSettings({
      ...settings,
      cameraKeyframes: settings.cameraKeyframes.filter(
        (keyframe) => keyframe.id !== selectedKeyframeId,
      ),
    });
    setSelectedKeyframeId(null);
  };

  const startExport = async () => {
    const scene = viewportRef.current?.getScene();
    if (!track || !scene || !ionToken) {
      setMessage('Load a flight and connect a Cesium ion token before exporting.');
      return;
    }
    const controller = new AbortController();
    renderAbortRef.current = controller;
    setPlaying(false);
    setMessage(null);
    setRenderJob({ ...IDLE_RENDER_JOB, status: 'preflight', tileStatus: 'Choose output file' });
    try {
      await exportFlightVideo({
        scene,
        track,
        settings,
        signal: controller.signal,
        onProgress: setRenderJob,
      });
    } catch (error) {
      if (isAbortError(error)) {
        setRenderJob({ ...IDLE_RENDER_JOB, status: 'canceled', tileStatus: 'Canceled' });
      } else {
        const errorMessage = error instanceof Error ? error.message : 'The render failed.';
        setRenderJob({ ...IDLE_RENDER_JOB, status: 'failed', error: errorMessage });
        setMessage(errorMessage);
      }
    } finally {
      renderAbortRef.current = null;
    }
  };

  const togglePlayback = useCallback(() => {
    if (!track || isRendering) return;
    if (flightSeconds >= settings.trimEndSeconds) setFlightSeconds(settings.trimStartSeconds);
    setPlaying((value) => !value);
  }, [flightSeconds, isRendering, settings.trimEndSeconds, settings.trimStartSeconds, track]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || isInteractiveTarget(event.target)) return;
      event.preventDefault();
      togglePlayback();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayback]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Volare home">
          <span className="brand-mark" aria-hidden="true">
            🪂
          </span>
          <span>
            <strong>Volare</strong>
          </span>
        </a>
        <div className="topbar-actions">
          <button
            type="button"
            className="button button--ghost button--settings"
            onClick={() => setActiveModal('settings')}
            disabled={isRendering}
          >
            Settings
          </button>
          <label className="button button--ghost file-button">
            Open IGC
            <input
              type="file"
              accept=".igc,text/plain"
              disabled={isRendering}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void loadFlightFile(file);
                event.target.value = '';
              }}
            />
          </label>
          <button
            type="button"
            className="button button--primary"
            onClick={() => setActiveModal('render')}
            disabled={!track || !ionToken || isRendering}
          >
            Render
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="stage-column" aria-label="Flight preview">
          <div
            className="stage-dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              if (file && !isRendering) void loadFlightFile(file);
            }}
          >
            <CesiumViewport
              ref={viewportRef}
              ionToken={ionToken}
              track={track}
              flightSeconds={flightSeconds}
              settings={settings}
              onError={handleSceneError}
            />
          </div>
          {message && (
            <div className="message-banner" role="alert">
              {message}
            </div>
          )}
          {track && track.warnings.length > 0 && (
            <details className="warning-list">
              <summary>
                {track.warnings.length} import note{track.warnings.length === 1 ? '' : 's'}
              </summary>
              {track.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </details>
          )}
        </section>

        <SettingsPanel
          settings={settings}
          camera={displayedCamera}
          cameraKeyframeSelected={Boolean(selectedKeyframe)}
          disabled={!track || isRendering}
          onChange={updateSettings}
          onCameraChange={updateCamera}
          onWatermarkChange={requestWatermarkChange}
        />
      </main>

      <footer className="timeline-panel">
        {track ? (
          <Timeline
            track={track}
            flightSeconds={flightSeconds}
            settings={settings}
            playing={playing}
            disabled={isRendering}
            selectedKeyframeId={selectedKeyframeId}
            onFlightTimeChange={(seconds) => {
              setPlaying(false);
              setFlightSeconds(seconds);
            }}
            onTrimChange={updateTrim}
            onTogglePlayback={togglePlayback}
            onAddKeyframe={addCameraKeyframe}
            onSelectKeyframe={selectCameraKeyframe}
            onMoveKeyframe={moveCameraKeyframe}
            onRemoveKeyframe={removeSelectedKeyframe}
          />
        ) : (
          <div className="empty-timeline">
            The altitude profile and trim controls will appear here.
          </div>
        )}
      </footer>

      {activeModal === 'settings' && (
        <Modal
          title="Application settings"
          eyebrow="Preferences"
          onClose={() => {
            setTokenDraft(ionToken);
            setActiveModal(null);
          }}
        >
          <div className="modal__body">
            <label className="modal-field">
              <span>Cesium ion access token</span>
              <input
                type="password"
                value={tokenDraft}
                onChange={(event) => setTokenDraft(event.target.value)}
                placeholder="eyJhbGciOi..."
                autoFocus
              />
              <small>
                Stored only in this browser and used to load Cesium terrain and imagery.
              </small>
            </label>
          </div>
          <footer className="modal__actions">
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                setTokenDraft(ionToken);
                setActiveModal(null);
              }}
            >
              Cancel
            </button>
            <button type="button" className="button button--primary" onClick={saveToken}>
              Save settings
            </button>
          </footer>
        </Modal>
      )}

      {activeModal === 'render' && (
        <Modal
          title="Render video"
          eyebrow="Export MP4"
          onClose={() => setActiveModal(null)}
          closeDisabled={isRendering}
        >
          <div className="modal__body">
            <div className="render-summary">
              <span>
                <small>Flight</small>
                <strong>{track?.metadata.fileName}</strong>
              </span>
              <span>
                <small>Output</small>
                <strong>
                  {settings.outputPreset.toUpperCase()} · {settings.aspectRatio}
                </strong>
              </span>
              <span>
                <small>Duration</small>
                <strong>
                  {formatDuration(settings.targetDurationSeconds)} · {settings.frameRate} fps
                </strong>
              </span>
            </div>
            <ExportProgress job={renderJob} onCancel={() => renderAbortRef.current?.abort()} />
          </div>
          <footer className="modal__actions">
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setActiveModal(null)}
              disabled={isRendering}
            >
              Close
            </button>
            <button
              type="button"
              className="button button--primary"
              onClick={startExport}
              disabled={isRendering}
            >
              {renderJob.status === 'completed' ? 'Render again' : 'Start rendering'}
            </button>
          </footer>
        </Modal>
      )}

      {activeModal === 'watermark' && (
        <Modal title="Keep the watermark?" eyebrow="Volare" onClose={() => setActiveModal(null)}>
          <div className="modal__body">
            <p className="watermark-message">
              Wait!! That watermark is barely there, we promise it won't ruin the shot. But it just
              might help a flying buddy discover this tool someday.
            </p>
          </div>
          <footer className="modal__actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => setActiveModal(null)}
            >
              Alright, I'll leave it on
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                updateSettings({
                  ...settings,
                  overlay: { ...settings.overlay, watermark: false },
                });
                setActiveModal(null);
              }}
            >
              Nah, disable it
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'input, textarea, select, button, a, label, summary, [contenteditable], [role="button"]',
      ),
    )
  );
}

function loadInitialToken(): string {
  return localStorage.getItem(TOKEN_STORAGE_KEY) ?? import.meta.env.VITE_CESIUM_ION_TOKEN ?? '';
}

function fitSettingsToFlight(settings: ProjectSettings, flightDurationSeconds: number) {
  const trimEndSeconds =
    settings.trimEndSeconds > settings.trimStartSeconds
      ? settings.trimEndSeconds
      : flightDurationSeconds;
  return sanitizeSettings({ ...settings, trimEndSeconds }, flightDurationSeconds);
}
