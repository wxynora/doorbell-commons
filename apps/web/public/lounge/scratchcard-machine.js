import * as T from 'three';

export function buildScratchcardMachine(room, { group, box, mesh }) {
  const machine = group(room, -4.72, 0, -3.48, .2);
  machine.name = 'lounge-scratchcard-machine';
  machine.userData.scratchcardMachine = true;

  const enamel = '#7c9d87', cream = '#f5e8ca', brass = '#c69a52', ink = '#4a594b';
  box(machine, 0, .095, 0, 1.14, .16, .76, ink, .06);
  box(machine, 0, .78, 0, 1.04, 1.38, .67, enamel, .10);
  box(machine, 0, .80, .347, .88, 1.21, .042, cream, .09);
  box(machine, 0, 1.51, 0, 1.12, .18, .74, enamel, .075);
  box(machine, 0, 1.47, .386, .94, .20, .03, brass, .035);

  // Recessed paper rack and a short dispensing tray distinguish it from the capsule drum.
  box(machine, 0, 1.04, .372, .70, .45, .034, ink, .05);
  for (const [index, color] of ['#d6b170', '#e9c8a5', '#b7cbb5'].entries()) {
    const ticket = box(machine, -.18 + .18 * index, 1.015, .397 + .012 * index, .25, .31, .016, color, .018);
    ticket.rotation.z = (index - 1) * .12;
    box(machine, -.18 + .18 * index, 1.028, .419 + .012 * index, .12, .078, .009, '#eee0bc', .012);
  }
  const outlet = box(machine, 0, .52, .377, .60, .094, .035, ink, .026);
  outlet.name = 'lounge-scratchcard-outlet';
  box(machine, 0, .458, .450, .66, .058, .22, brass, .027);
  box(machine, .21, .70, .377, .097, .083, .047, brass, .023);
  box(machine, .21, .71, .406, .048, .012, .012, ink, .004);

  const label = document.createElement('canvas');
  label.width = 512;
  label.height = 108;
  const ctx = label.getContext('2d');
  ctx.fillStyle = cream;
  ctx.fillRect(0, 0, label.width, label.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = ink;
  ctx.font = '700 73px "PingFang SC", "Noto Sans CJK SC", sans-serif';
  ctx.fillText('刮刮乐', 256, 54);
  const texture = new T.CanvasTexture(label);
  texture.colorSpace = T.SRGBColorSpace;
  const sign = mesh(machine, new T.PlaneGeometry(.86, .182), new T.MeshBasicMaterial({ map: texture }), 0, 1.47, .408);
  sign.userData.noOutline = true;
  sign.castShadow = false;
  return machine;
}

export async function dispenseScratchcard(outlet, requestDraw, onStart) {
  const art = new URL('./scratchcard-ticket.svg', import.meta.url).href;
  const image = await new T.ImageLoader().loadAsync(art);
  const front = document.createElement('canvas');
  front.width = 400;
  front.height = 600;
  const ctx = front.getContext('2d');
  ctx.drawImage(image, 0, 0, front.width, front.height);
  ctx.fillStyle = '#bbc0c8';
  ctx.fillRect(24, 420, 352, 106);
  const texture = new T.CanvasTexture(front);
  texture.colorSpace = T.SRGBColorSpace;
  const width = .53;
  const length = width * 1.5;
  const geometry = new T.PlaneGeometry(width, length);
  const material = new T.MeshBasicMaterial({ map: texture, side: T.DoubleSide, toneMapped: false });
  const paper = new T.Mesh(geometry, material);
  paper.name = 'lounge-scratchcard-issued-paper';
  paper.rotation.x = -Math.PI / 2 + .15;
  paper.visible = false;
  outlet.add(paper);
  try {
    onStart();
    await new Promise(resolve => {
      let startedAt;
      let progress = 0;
      let fullyOutAt;
      function frame(now) {
        startedAt ??= now;
        const next = Math.min(1, (now - startedAt) / 540);
        if (next !== progress) {
          progress = next;
          const halfLength = length * progress / 2;
          paper.visible = true;
          // Keep the rear edge at the outlet and reveal the actual print as it slides out.
          paper.scale.y = progress;
          paper.position.set(0, -Math.cos(paper.rotation.x) * halfLength, .022 - Math.sin(paper.rotation.x) * halfLength);
          texture.repeat.y = progress;
          requestDraw();
        }
        if (progress === 1) fullyOutAt ??= now;
        if (fullyOutAt === undefined || now - fullyOutAt < 200) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  } finally {
    paper.removeFromParent();
    geometry.dispose();
    material.dispose();
    texture.dispose();
    requestDraw();
  }
}
