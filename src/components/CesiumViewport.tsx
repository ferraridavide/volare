import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

import type { FlightTrack, ProjectSettings } from '@/domain/types';
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
  onError: (message: string) => void;
}

export const CesiumViewport = forwardRef<CesiumViewportHandle, CesiumViewportProps>(
  function CesiumViewport({ ionToken, track, flightSeconds, settings, onError }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const creditRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<CesiumFlightScene | null>(null);
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
        <div ref={containerRef} className="cesium-host" aria-label="3D flight preview" />
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
