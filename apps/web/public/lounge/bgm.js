// Approved Sunlight on the Floorboards loop: 0–32 seconds, no added fades.
const button = document.createElement('button');
button.type = 'button';
document.querySelector('#room-tools').append(button);
let context, source, gain;
let muted = false, loading, closed = false;
function updateButton() {
  button.innerHTML = `<img src="./icons/music${muted ? '-muted' : ''}-simple.svg" alt=""><span>${muted ? '静音' : '音乐'}</span>`;
  button.setAttribute('aria-label', muted ? '开启休息室音乐' : '静音休息室音乐');
  button.setAttribute('aria-pressed', String(!muted));
}
function startMusic() {
  if (closed || muted) return;
  context ||= new AudioContext();
  // Browsers may require a user gesture; do not block loading on resume.
  void context.resume().catch(() => {});
  if (source || loading) return;
  loading = (async () => {
    const response = await fetch(new URL('./sunlight-on-the-floorboards.mp3', import.meta.url));
    if (!response.ok) throw new Error('Audio unavailable');
    const decoded = await context.decodeAudioData(await response.arrayBuffer());
    if (closed) return;
    const length = Math.round(32 * decoded.sampleRate);
    const buffer = context.createBuffer(decoded.numberOfChannels, length, decoded.sampleRate);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      buffer.getChannelData(c).set(decoded.getChannelData(c).subarray(0, length));
    }
    gain = context.createGain();
    gain.gain.value = muted ? 0 : 1;
    gain.connect(context.destination);
    source = context.createBufferSource();
    source.buffer = buffer; source.loop = true;
    source.connect(gain); source.start();
  })().catch(error => {
    button.querySelector('span').textContent = '重试';
    button.setAttribute('aria-label', '音乐加载失败，点击重试');
    console.error(error);
  }).finally(() => { loading = null; });
}
button.onclick = () => {
  if (!source && !loading && !muted) { startMusic(); return; }
  muted = !muted;
  if (gain) gain.gain.value = muted ? 0 : 1;
  updateButton();
  if (!muted) startMusic();
};
function unlockMusic(event) {
  if (button.contains(event.target)) return;
  if (!muted && context?.state !== 'running') startMusic();
}
document.addEventListener('pointerdown', unlockMusic);
document.addEventListener('keydown', unlockMusic);
window.addEventListener('pagehide', () => {
  closed = true; source?.stop(); source = null;
  void context?.close();
  document.removeEventListener('pointerdown', unlockMusic);
  document.removeEventListener('keydown', unlockMusic);
});
updateButton();
startMusic();
