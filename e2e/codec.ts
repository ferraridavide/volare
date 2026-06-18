import {
  BufferSource,
  BufferTarget,
  CanvasSource,
  Input,
  Mp4InputFormat,
  Mp4OutputFormat,
  Output,
  canEncodeVideo,
} from 'mediabunny';

const button = document.querySelector<HTMLButtonElement>('#encode')!;
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const result = document.querySelector<HTMLPreElement>('#result')!;

button.addEventListener('click', () => void encodeTestVideo());

async function encodeTestVideo(): Promise<void> {
  result.dataset.status = 'working';
  try {
    const supported = await canEncodeVideo('avc', {
      width: canvas.width,
      height: canvas.height,
      bitrate: 1_000_000,
    });
    if (!supported) throw new Error('Chromium does not expose an H.264 WebCodecs encoder.');

    const frameCount = 15;
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'reserve' }), target });
    const source = new CanvasSource(canvas, {
      codec: 'avc',
      bitrate: 1_000_000,
      latencyMode: 'quality',
    });
    output.addVideoTrack(source, { frameRate: 15, maximumPacketCount: frameCount });
    await output.start();

    for (let frame = 0; frame < frameCount; frame += 1) {
      paintFrame(frame);
      await source.add(frame / 15, 1 / 15);
    }
    await output.finalize();
    const buffer = target.buffer!;
    const input = new Input({
      formats: [new Mp4InputFormat()],
      source: new BufferSource(buffer),
    });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('Encoded MP4 does not contain a video track.');
    const metadata = {
      width: await track.getCodedWidth(),
      height: await track.getCodedHeight(),
      duration: await input.computeDuration(),
      bytes: buffer.byteLength,
    };
    result.textContent = JSON.stringify(metadata);
    result.dataset.status = 'complete';
  } catch (error) {
    result.textContent = error instanceof Error ? error.message : String(error);
    result.dataset.status = 'failed';
  }
}

function paintFrame(frame: number): void {
  const context = canvas.getContext('2d')!;
  context.fillStyle = `hsl(${frame * 24} 65% 35%)`;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'white';
  context.font = 'bold 48px system-ui';
  context.fillText(String(frame + 1), 132, 108);
}
