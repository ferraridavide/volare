import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';

const IGC = [
  'HFDTE170624',
  'HFPLTPILOTINCHARGE:Test Pilot',
  'B1000004500000N01100000EA0100001000',
  'B1000104501000N01100000EA0110001100',
].join('\n');

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', '');
  });

  it('explains how to obtain the required free Cesium ion token', () => {
    render(<App />);

    expect(screen.getByText(/global terrain and satellite imagery/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get a free Cesium ion token' })).toHaveAttribute(
      'href',
      'https://ion.cesium.com/',
    );
  });

  it('loads a local IGC and exposes the editor timeline', async () => {
    render(<App />);
    const input = screen.getByLabelText('Open IGC');
    const file = new File([IGC], 'monte-grappa.igc', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByLabelText('Flight timeline')).toBeInTheDocument());
    expect(screen.getByLabelText('Flight timeline')).toBeInTheDocument();
    expect(screen.getByLabelText('Current flight time')).toHaveValue('0');
  });

  it('toggles playback with Space outside interactive controls', async () => {
    render(<App />);
    const file = new File([IGC], 'keyboard.igc', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText('Open IGC'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByLabelText('Play preview')).toBeInTheDocument());

    fireEvent.keyDown(document, { code: 'Space' });
    expect(screen.getByLabelText('Pause preview')).toBeInTheDocument();

    fireEvent.keyDown(document, { code: 'Space', repeat: true });
    expect(screen.getByLabelText('Pause preview')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByLabelText('Current flight time'), { code: 'Space' });
    expect(screen.getByLabelText('Pause preview')).toBeInTheDocument();

    fireEvent.keyDown(document, { code: 'Space' });
    expect(screen.getByLabelText('Play preview')).toBeInTheDocument();
  });

  it('shows a useful validation error for an invalid IGC', async () => {
    render(<App />);
    const input = screen.getByLabelText('Open IGC');
    fireEvent.change(input, {
      target: { files: [new File(['Bbroken'], 'bad.igc', { type: 'text/plain' })] },
    });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('expected at least 2'));
  });

  it('allows camera values beyond slider limits', () => {
    render(<App />);
    const input = screen.getByLabelText('Follow smoothing value');

    fireEvent.change(input, { target: { value: '12' } });

    expect(input).toHaveValue(12);
  });

  it('keeps the application preset within useful slider ranges', () => {
    render(<App />);

    expect(screen.getByLabelText('Follow distance')).toHaveAttribute('min', '200');
    expect(screen.getByLabelText('Follow distance')).toHaveAttribute('max', '10000');
    expect(screen.getByLabelText('Follow distance')).toHaveValue('5000');
    expect(screen.getByLabelText('Heading smoothing')).toHaveAttribute('max', '20');
    expect(screen.getByLabelText('Field of view')).toHaveAttribute('min', '15');
    expect(screen.getByLabelText('Trail length')).toHaveAttribute('max', '20000');
  });

  it('restores the saved parameter preset after restarting', async () => {
    const firstRender = render(<App />);
    const file = new File([IGC], 'first-flight.igc', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText('Open IGC'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByLabelText('Flight timeline')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Follow smoothing value'), {
      target: { value: '12' },
    });
    fireEvent.change(screen.getByLabelText('Aspect ratio'), { target: { value: 'landscape' } });
    await waitFor(() =>
      expect(localStorage.getItem('paraglider-render:settings-preset')).toContain('landscape'),
    );

    firstRender.unmount();
    render(<App />);

    expect(screen.getByLabelText('Follow smoothing value')).toHaveValue(12);
    expect(screen.getByLabelText('Aspect ratio')).toHaveValue('landscape');

    const nextFile = new File([IGC], 'next-flight.igc', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText('Open IGC'), { target: { files: [nextFile] } });
    await waitFor(() => expect(screen.getByLabelText('Flight timeline')).toBeInTheDocument());
    expect(screen.getByLabelText('Follow smoothing value')).toHaveValue(12);
    expect(screen.getByLabelText('Aspect ratio')).toHaveValue('landscape');
  });

  it('adds, selects, moves, edits, and removes camera keyframes', async () => {
    render(<App />);
    const file = new File([IGC], 'keyframes.igc', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText('Open IGC'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByLabelText('Flight timeline')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Current flight time'), { target: { value: '5' } });
    fireEvent.click(screen.getByLabelText('Add camera keyframe'));
    const marker = screen.getByLabelText('Camera keyframe 1');
    expect(marker).toHaveValue('5');
    expect(screen.getByText('Editing selected camera keyframe')).toBeInTheDocument();

    fireEvent.change(marker, { target: { value: '7' } });
    expect(marker).toHaveValue('7');
    expect(screen.getByLabelText('Current flight time')).toHaveValue('7');
    fireEvent.change(screen.getByLabelText('Follow distance value'), { target: { value: '700' } });
    expect(screen.getByLabelText('Follow distance value')).toHaveValue(700);

    fireEvent.click(screen.getByLabelText('Remove selected camera keyframe'));
    expect(screen.queryByLabelText('Camera keyframe 1')).not.toBeInTheDocument();
  });

  it('keeps overlay altitude independent from track altitude correction', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Open IGC'), {
      target: { files: [new File([IGC], 'altitude.igc', { type: 'text/plain' })] },
    });
    await waitFor(() => expect(screen.getByLabelText('Flight statistics')).toBeInTheDocument());

    expect(screen.getByLabelText('Flight statistics')).toHaveTextContent('1,000 m');
    fireEvent.change(screen.getByLabelText('Altitude correction value'), {
      target: { value: '500' },
    });

    expect(screen.getByLabelText('Flight statistics')).toHaveTextContent('1,000 m');
    expect(screen.getByLabelText('Flight statistics')).toHaveTextContent('00:00');
  });

  it('confirms before disabling the default watermark', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Open IGC'), {
      target: { files: [new File([IGC], 'watermark.igc', { type: 'text/plain' })] },
    });
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'volare.davide.im' })).toBeInTheDocument(),
    );
    const toggle = screen.getByLabelText('Show Volare watermark');

    fireEvent.click(toggle);
    expect(screen.getByRole('dialog')).toHaveTextContent('That watermark is barely there');
    expect(toggle).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: "Alright, I'll leave it on" }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: 'Nah, disable it' }));
    expect(toggle).not.toBeChecked();
    expect(screen.queryByRole('link', { name: 'volare.davide.im' })).not.toBeInTheDocument();
  });
});
