import { formatDuration } from '@/domain/format';
import type { CameraKeyframe, FlightTrack, ProjectSettings } from '@/domain/types';

interface TimelineProps {
  track: FlightTrack;
  flightSeconds: number;
  settings: ProjectSettings;
  playing: boolean;
  disabled: boolean;
  selectedKeyframeId: string | null;
  onFlightTimeChange: (seconds: number) => void;
  onTrimChange: (startSeconds: number, endSeconds: number) => void;
  onTogglePlayback: () => void;
  onAddKeyframe: () => void;
  onSelectKeyframe: (id: string) => void;
  onMoveKeyframe: (id: string, flightSeconds: number) => void;
  onRemoveKeyframe: () => void;
}

export function Timeline(props: TimelineProps) {
  const altitudePath = buildAltitudePath(props.track);
  const startPercent = (props.settings.trimStartSeconds / props.track.durationSeconds) * 100;
  const endPercent = (props.settings.trimEndSeconds / props.track.durationSeconds) * 100;

  return (
    <section className="timeline" aria-label="Flight timeline">
      <button
        type="button"
        className="play-button"
        onClick={props.onTogglePlayback}
        disabled={props.disabled}
        aria-label={props.playing ? 'Pause preview' : 'Play preview'}
      >
        {props.playing ? 'Ⅱ' : '▶'}
      </button>
      <span className="timeline-time">{formatDuration(props.flightSeconds)}</span>
      <div className="timeline-track">
        <svg viewBox="0 0 1000 90" preserveAspectRatio="none" aria-hidden="true">
          <path d={altitudePath} className="altitude-area" />
        </svg>
        <div className="trim-shade trim-shade--left" style={{ width: `${startPercent}%` }} />
        <div className="trim-shade trim-shade--right" style={{ width: `${100 - endPercent}%` }} />
        <input
          className="timeline-scrubber"
          type="range"
          min={0}
          max={props.track.durationSeconds}
          step={0.1}
          value={props.flightSeconds}
          onChange={(event) => props.onFlightTimeChange(Number(event.target.value))}
          disabled={props.disabled}
          aria-label="Current flight time"
        />
        <input
          className="trim-handle trim-handle--start"
          type="range"
          min={0}
          max={props.track.durationSeconds}
          step={0.1}
          value={props.settings.trimStartSeconds}
          onChange={(event) =>
            props.onTrimChange(
              Math.min(Number(event.target.value), props.settings.trimEndSeconds - 0.1),
              props.settings.trimEndSeconds,
            )
          }
          disabled={props.disabled}
          aria-label="Trim start"
        />
        <input
          className="trim-handle trim-handle--end"
          type="range"
          min={0}
          max={props.track.durationSeconds}
          step={0.1}
          value={props.settings.trimEndSeconds}
          onChange={(event) =>
            props.onTrimChange(
              props.settings.trimStartSeconds,
              Math.max(Number(event.target.value), props.settings.trimStartSeconds + 0.1),
            )
          }
          disabled={props.disabled}
          aria-label="Trim end"
        />
        {props.settings.cameraKeyframes.map((keyframe, index) => (
          <KeyframeMarker
            key={keyframe.id}
            keyframe={keyframe}
            index={index}
            durationSeconds={props.track.durationSeconds}
            selected={keyframe.id === props.selectedKeyframeId}
            disabled={props.disabled}
            onSelect={props.onSelectKeyframe}
            onMove={props.onMoveKeyframe}
          />
        ))}
      </div>
      <span className="timeline-time">{formatDuration(props.track.durationSeconds)}</span>
      <div className="keyframe-controls" aria-label="Camera keyframes">
        <button
          type="button"
          onClick={props.onAddKeyframe}
          disabled={props.disabled}
          aria-label="Add camera keyframe"
          title="Add camera keyframe"
        >
          +◇
        </button>
        <button
          type="button"
          onClick={props.onRemoveKeyframe}
          disabled={props.disabled || !props.selectedKeyframeId}
          aria-label="Remove selected camera keyframe"
          title="Remove selected camera keyframe"
        >
          −◇
        </button>
      </div>
    </section>
  );
}

interface KeyframeMarkerProps {
  keyframe: CameraKeyframe;
  index: number;
  durationSeconds: number;
  selected: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, flightSeconds: number) => void;
}

function KeyframeMarker(props: KeyframeMarkerProps) {
  return (
    <input
      className={`keyframe-marker${props.selected ? ' keyframe-marker--selected' : ''}`}
      type="range"
      min={0}
      max={props.durationSeconds}
      step={0.1}
      value={props.keyframe.flightSeconds}
      disabled={props.disabled}
      aria-label={`Camera keyframe ${props.index + 1}`}
      aria-selected={props.selected}
      onPointerDown={() => props.onSelect(props.keyframe.id)}
      onFocus={() => props.onSelect(props.keyframe.id)}
      onChange={(event) => props.onMove(props.keyframe.id, Number(event.target.value))}
    />
  );
}

function buildAltitudePath(track: FlightTrack): string {
  const minimum = track.bounds.minimumAltitudeMeters;
  const range = Math.max(1, track.bounds.maximumAltitudeMeters - minimum);
  const stride = Math.max(1, Math.floor(track.fixes.length / 400));
  const sampled = track.fixes.filter((_, index) => index % stride === 0);
  if (sampled.at(-1) !== track.fixes.at(-1)) sampled.push(track.fixes.at(-1)!);
  const points = sampled.map((fix) => {
    const x = (fix.elapsedSeconds / track.durationSeconds) * 1000;
    const y = 82 - ((fix.altitudeMeters - minimum) / range) * 65;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M 0,90 L ${points.join(' L ')} L 1000,90 Z`;
}
