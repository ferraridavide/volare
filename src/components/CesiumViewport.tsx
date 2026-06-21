import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { adjustCameraFromDrag } from '@/domain/camera';
import type { CameraSettings, FlightTrack, ProjectSettings } from '@/domain/types';
import { CesiumFlightScene } from '@/scene/CesiumFlightScene';

import { StatsOverlay } from './StatsOverlay';

export interface CesiumViewportHandle {
  getScene: () => CesiumFlightScene | null;
}

interface CesiumViewportProps {
  ionToken: string;
  track: FlightTrack | null;
  flightSeconds: number;
  settings: ProjectSettings;
  camera: CameraSettings;
  disabled: boolean;
  onCameraChange: (camera: CameraSettings) => void;
  onError: (message: string) => void;
}

interface CameraDrag {
  pointerId: number;
  startX: number;
  startY: number;
  camera: CameraSettings;
}

export const CesiumViewport = forwardRef<CesiumViewportHandle, CesiumViewportProps>(
  function CesiumViewport(
    { ionToken, track, flightSeconds, settings, camera, disabled, onCameraChange, onError },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const creditRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<CesiumFlightScene | null>(null);
    const dragRef = useRef<CameraDrag | null>(null);
    const [sceneVersion, setSceneVersion] = useState(0);

    useImperativeHandle(ref, () => ({ getScene: () => sceneRef.current }), []);

    useEffect(() => {
      if (!ionToken || !containerRef.current || !creditRef.current) return;
      try {
        sceneRef.current = new CesiumFlightScene(
          containerRef.current,
          creditRef.current,
          ionToken,
          onError,
        );
        setSceneVersion((version) => version + 1);
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Cesium could not be initialized.');
      }
      return () => {
        sceneRef.current?.destroy();
        sceneRef.current = null;
      };
    }, [ionToken, onError]);

    useEffect(() => {
      if (!track || !sceneRef.current) return;
      try {
        sceneRef.current.setTrack(track, settings);
        sceneRef.current.updateAtTime(flightSeconds, settings);
      } catch (error) {
        onError(error instanceof Error ? error.message : 'The flight scene could not be updated.');
      }
    }, [track, flightSeconds, settings, sceneVersion, onError]);

    const viewportClassName =
      settings.aspectRatio === 'vertical'
        ? 'viewport-frame viewport-frame--vertical'
        : 'viewport-frame';

    return (
      <div className={viewportClassName}>
        <div
          ref={containerRef}
          className="cesium-host"
          aria-label="3D flight preview"
          onPointerDown={(event) => {
            if (disabled || !track || event.button !== 0) return;
            dragRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              camera,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            event.currentTarget.classList.add('cesium-host--dragging');
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            onCameraChange(
              adjustCameraFromDrag(
                drag.camera,
                event.clientX - drag.startX,
                event.clientY - drag.startY,
              ),
            );
          }}
          onPointerUp={(event) => finishCameraDrag(event.currentTarget, event.pointerId, dragRef)}
          onPointerCancel={(event) =>
            finishCameraDrag(event.currentTarget, event.pointerId, dragRef)
          }
        />
        {!ionToken && (
          <div className="viewport-placeholder">
            <div className="placeholder-orbit" />
            <div className="viewport-placeholder__message">
              <strong>Connect Cesium ion</strong>
              <p>
                Volare uses Cesium ion to load the global terrain and satellite imagery needed to
                render your flight. Create a free account, copy an access token, then add it in
                Settings.
              </p>
              <a href="https://ion.cesium.com/" target="_blank" rel="noreferrer">
                Get a free Cesium ion token
              </a>
            </div>
          </div>
        )}
        {ionToken && !track && (
          <div className="viewport-placeholder viewport-placeholder--quiet">
            <p>Drop an IGC file to begin.</p>
          </div>
        )}
        {track && <StatsOverlay track={track} flightSeconds={flightSeconds} settings={settings} />}
        <div ref={creditRef} className="cesium-widget-credits cesium-credits" />
      </div>
    );
  },
);

function finishCameraDrag(
  target: HTMLDivElement,
  pointerId: number,
  dragRef: { current: CameraDrag | null },
): void {
  if (dragRef.current?.pointerId !== pointerId) return;
  dragRef.current = null;
  if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
  target.classList.remove('cesium-host--dragging');
}
