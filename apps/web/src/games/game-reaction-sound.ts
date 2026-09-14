/** One audio context per mounted table; never queue sounds while audio is blocked. */
let context: AudioContext | undefined;
let users = 0;

function unlock() {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume().catch(() => {});
  } catch { /* Audio availability must not affect a paid reaction. */ }
}

export function retainReactionSound() {
  if (users++ === 0) {
    document.addEventListener('pointerup', unlock, true);
    document.addEventListener('keydown', unlock, true);
  }
  return () => {
    if (--users !== 0) return;
    document.removeEventListener('pointerup', unlock, true);
    document.removeEventListener('keydown', unlock, true);
    const previous = context;
    context = undefined;
    if (previous && previous.state !== 'closed') void previous.close().catch(() => {});
  };
}

export function playReactionSound(kind: 'flower' | 'bomb' | 'card' | 'tile') {
  const ctx = context;
  if (!ctx || ctx.state !== 'running' || document.hidden) return;
  const now = ctx.currentTime;
  const tone = (frequency: number, endFrequency: number, delay: number, duration: number, volume: number) => {
    const source = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = now + delay;
    source.type = 'sine';
    source.frequency.setValueAtTime(frequency, start);
    source.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(gain).connect(ctx.destination);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    source.start(start); source.stop(start + duration);
  };
  if (kind === 'flower') {
    // A small ascending bell flourish, with a faint glassy upper partial.
    [1046.5, 1318.5, 1568].forEach((frequency, i) => {
      tone(frequency, frequency, i * 0.075, 0.48, 0.11);
      tone(frequency * 2.76, frequency * 2.76, i * 0.075, 0.19, 0.018);
    });
  } else if (kind === 'bomb') {
    tone(150, 42, 0, 0.36, 0.28);
    const duration = 0.43;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    noise.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2800, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + duration);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); };
    noise.start(now); noise.stop(now + duration);
  } else {
    tone(kind === 'tile' ? 1800 : 360, kind === 'tile' ? 900 : 140, 0, 0.075, 0.12);
    const duration = kind === 'tile' ? 0.045 : 0.09;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / samples.length, 3);
    const noise = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    noise.buffer = buffer; filter.type = 'bandpass';
    filter.frequency.value = kind === 'tile' ? 2400 : 1500;
    gain.gain.value = 0.22;
    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); };
    noise.start(now); noise.stop(now + duration);
  }
}
