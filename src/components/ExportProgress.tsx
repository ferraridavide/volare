import { formatDuration } from '@/domain/format';
import type { RenderJob } from '@/domain/types';

interface ExportProgressProps {
  job: RenderJob;
  onCancel: () => void;
}

export function ExportProgress({ job, onCancel }: ExportProgressProps) {
  if (job.status === 'idle') return null;
  const percentage = job.totalFrames
    ? Math.round((job.completedFrames / job.totalFrames) * 100)
    : 0;
  const active = ['preflight', 'rendering', 'finalizing'].includes(job.status);

  return (
    <div className="render-progress" role="status" aria-live="polite">
      <div className="render-progress__heading">
        <div>
          <span className="eyebrow">Offline renderer</span>
          <strong>{renderStatusLabel(job.status)}</strong>
        </div>
        {active && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      <div className="progress-track">
        <span style={{ width: `${percentage}%` }} />
      </div>
      <div className="progress-meta">
        <span>
          {job.totalFrames
            ? `${job.completedFrames.toLocaleString()} / ${job.totalFrames.toLocaleString()} frames`
            : job.tileStatus}
        </span>
        <span>
          {percentage}% · {formatDuration(job.elapsedSeconds)}
        </span>
      </div>
      {job.error && <p className="inline-error">{job.error}</p>}
    </div>
  );
}

function renderStatusLabel(status: RenderJob['status']): string {
  const labels: Record<RenderJob['status'], string> = {
    idle: 'Ready',
    preflight: 'Checking browser and encoder',
    rendering: 'Rendering fully loaded frames',
    finalizing: 'Finalizing MP4',
    completed: 'Video saved',
    canceled: 'Render canceled',
    failed: 'Render failed',
  };
  return labels[status];
}
