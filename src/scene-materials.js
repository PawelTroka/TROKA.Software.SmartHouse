import * as THREE from '../vendor/three.module.js';

// Original procedural textures: no external images, network requests or asset licences.
// These give proposed finishes visual scale; they are not photographs of the site.
export function createSurfaceTextures() {
  let seed = 714301;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const make = (base, draw, size = 512) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const context = canvas.getContext('2d'); context.fillStyle = base; context.fillRect(0, 0, size, size);
    draw(context, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  };
  const speckles = (ctx, size, count, colors, scale = 2) => {
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = colors[Math.floor(random() * colors.length)];
      ctx.fillRect(random() * size, random() * size, 0.5 + random() * scale, 0.5 + random() * scale);
    }
  };
  const stone = make('#d5c9b6', (ctx, size) => {
    speckles(ctx, size, 18000, ['#cbbfab44', '#eee6d34d', '#b7aa9729'], 3.5);
    for (let i = 0; i < 45; i++) {
      ctx.strokeStyle = '#ab9f8b12'; ctx.lineWidth = 1 + random() * 3; ctx.beginPath();
      const y = random() * size; ctx.moveTo(0, y);
      ctx.bezierCurveTo(size * .3, y + 10, size * .7, y - 15, size, y + 5); ctx.stroke();
    }
  });
  const stucco = make('#f4f0e7', (ctx, size) => speckles(ctx, size, 26000, ['#988f811b', '#ffffff66', '#d6cec032'], 1));
  const wood = make('#ad8966', (ctx, size) => {
    for (let y = 0; y < size; y += 2) {
      ctx.strokeStyle = `rgba(75,47,28,${.025 + random() * .12})`; ctx.lineWidth = .5 + random();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(size * .3, y + 6 * random(), size * .65, y - 4, size, y); ctx.stroke();
    }
    for (let y = 0; y < size; y += 64) { ctx.fillStyle = '#523a2a55'; ctx.fillRect(0, y, size, 1); ctx.fillStyle = '#e9c19c55'; ctx.fillRect(0, y + 1, size, 1); }
  });
  const grass = make('#b6bd9d', (ctx, size) => {
    speckles(ctx, size, 15000, ['#5b6f5340', '#f3edcb2b', '#c9d2a14d'], 2);
    for (let i = 0; i < 18000; i++) {
      const x = random() * size, y = random() * size;
      ctx.strokeStyle = ['#4f6b4540', '#d9dfb14d', '#6e854a44'][i % 3]; ctx.lineWidth = .6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + random() * 3 - 1.5, y - 2 - random() * 4); ctx.stroke();
    }
  });
  const foliage = make('#b0bc91', (ctx, size) => {
    speckles(ctx, size, 13000, ['#42583244', '#d5dba255', '#78975d88', '#c4cf9d66'], 3);
    for (let i = 0; i < 2100; i++) {
      const x = random() * size, y = random() * size, h = 4 + random() * 12;
      ctx.strokeStyle = '#34502c44'; ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h);
      ctx.moveTo(x - 3, y - 3); ctx.lineTo(x, y - h * .5); ctx.lineTo(x + 3, y - 3); ctx.stroke();
    }
  });
  const roof = make('#56605d', (ctx, size) => {
    speckles(ctx, size, 16000, ['#101a1b33', '#bcc6bd22'], 2);
    for (let y = 0; y < size; y += 32) { ctx.fillStyle = '#18232055'; ctx.fillRect(0, y, size, 2); }
    for (let x = 0; x < size; x += 64) { ctx.fillStyle = '#aab7ac33'; ctx.fillRect(x, 0, 1, size); }
  });
  const water = make('#82bdb6', (ctx, size) => {
    for (let j = 0; j < 21; j++) {
      ctx.beginPath(); ctx.lineWidth = .5 + j % 3; ctx.strokeStyle = j % 2 ? '#d9f8e655' : '#3d8a8950';
      for (let x = 0; x <= size; x += 3) {
        const y = j * size / 20 + Math.sin(x / 33 + j) * 5 + Math.cos(x / 72 - j * .7) * 10;
        if (!x) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
  const textiles = make('#e8e4d8', (ctx, size) => {
    ctx.fillStyle = '#9188781a';
    for (let p = 0; p < size; p += 3) { ctx.fillRect(p, 0, 1, size); ctx.fillRect(0, p, size, 1); }
  });
  return {stone, stucco, wood, grass, foliage, roof, water, textiles,
    dispose() { [stone, stucco, wood, grass, foliage, roof, water, textiles].forEach(texture => texture.dispose()); }};
}
