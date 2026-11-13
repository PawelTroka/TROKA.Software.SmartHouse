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
  const foliage = make('#aebc94', (ctx, size) => {
    speckles(ctx, size, 9000, ['#52633c55', '#dce0b24d', '#7d965d77'], 4);
    // Flattened, branching sprays give thuja scale-leaf detail instead of the
    // same generic stipple used for lawn or broadleaf crowns. Offset copies
    // keep sprays crossing texture edges continuous when the map repeats.
    for (let i = 0; i < 360; i++) {
      const x = random() * size, y = random() * size, length = 23 + random() * 40;
      const rotation = (random() - .5) * 1.8;
      const shade = ['#5e784d', '#78915b', '#91a66e', '#b8c58c'][i % 4];
      for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
        if (x + dx < -length || x + dx > size + length || y + dy < -length || y + dy > size + length) continue;
        ctx.save(); ctx.translate(x + dx, y + dy); ctx.rotate(rotation);
        ctx.strokeStyle = '#556b415c'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -length); ctx.stroke();
        for (let tier = 1; tier < 7; tier++) for (const side of [-1, 1]) {
          const y0 = -length * tier / 8, reach = length * (.29 - tier * .025);
          const endX = side * reach, endY = y0 - length * .16;
          ctx.strokeStyle = shade; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(endX, endY); ctx.stroke();
          for (let leaf = 1; leaf < 6; leaf++) {
            const t = leaf / 6, lx = endX * t, ly = y0 + (endY - y0) * t;
            ctx.fillStyle = leaf % 2 ? shade : '#c4cf9d99';
            ctx.beginPath(); ctx.moveTo(lx, ly + 1.4); ctx.lineTo(lx + side * 2.6, ly - 2.5); ctx.lineTo(lx + side * .6, ly - 4.2); ctx.closePath(); ctx.fill();
          }
        }
        ctx.restore();
      }
    }
    speckles(ctx, size, 5000, ['#e0e5bd30', '#354a302b'], 1.1);
  });
  const pineNeedles = make('#a5b68d', (ctx, size) => {
    speckles(ctx, size, 9000, ['#405c3d55', '#d6dfaa38', '#85996966'], 3);
    // Dense paired needle fans sit on fine brown twigs. Each pad has its own
    // UVs, so this remains small botanical detail rather than giant leaf marks.
    for (let i = 0; i < 490; i++) {
      const x = random() * size, y = random() * size, length = 16 + random() * 30;
      const rotation = random() * Math.PI * 2;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rotation);
      ctx.strokeStyle = '#776e4b70'; ctx.lineWidth = .7;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -length * .75); ctx.stroke();
      for (let needle = 0; needle < 15; needle++) {
        const along = random() * length * .7, fan = (random() - .5) * 2.3;
        const reach = 6 + random() * 14;
        const endX = Math.sin(fan) * reach, endY = -along - Math.cos(fan) * reach;
        ctx.strokeStyle = ['#3b593eaa', '#637f4fcc', '#d4ddaa99', '#92ad71cc'][needle % 4];
        ctx.lineWidth = needle % 3 ? .7 : 1.1;
        ctx.beginPath(); ctx.moveTo(0, -along); ctx.quadraticCurveTo(endX * .3, endY + 2, endX, endY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(.8, -along); ctx.lineTo(endX + 1.2, endY + .7); ctx.stroke();
      }
      ctx.restore();
    }
  });
  const bark = make('#b7a791', (ctx, size) => {
    speckles(ctx, size, 11000, ['#766d6055', '#d9cfb24d', '#a18b704d'], 2.5);
    // Long irregular plates and dark fissures run along the stem, unlike the
    // horizontal timber-board map used for garden furniture.
    const columns = 19, step = size / columns;
    for (let column = -1; column <= columns; column++) {
      let y = -80 + random() * 55;
      while (y < size) {
        const x = column * step, length = 32 + random() * 71;
        const left = 2 + random() * 4, right = step - 2 - random() * 4;
        ctx.fillStyle = ['#857562b0', '#b09b7de6', '#c1b298cc', '#98826cbf'][Math.floor(random() * 4)];
        ctx.beginPath(); ctx.moveTo(x + left + 2, y); ctx.lineTo(x + right - 3, y + 3);
        ctx.lineTo(x + right, y + length * .42); ctx.lineTo(x + right - 2, y + length - 4);
        ctx.lineTo(x + left + 3, y + length); ctx.lineTo(x + left, y + length * .56); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#514b425f'; ctx.lineWidth = 1.3; ctx.stroke();
        ctx.strokeStyle = '#e4d9be77'; ctx.lineWidth = .9; ctx.beginPath();
        ctx.moveTo(x + left + 3, y + 4); ctx.lineTo(x + left + 1, y + length * .52); ctx.lineTo(x + left + 4, y + length - 5); ctx.stroke();
        ctx.strokeStyle = '#64534244'; ctx.lineWidth = .6; ctx.beginPath();
        ctx.moveTo(x + step * .55, y + length * .15); ctx.lineTo(x + step * .4, y + length * .7); ctx.stroke();
        y += length - 2;
      }
    }
    speckles(ctx, size, 5000, ['#342f291b', '#f4e8ce2b'], 1.2);
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
  // A soft, direction-neutral sky reflection. The actual sun direction still
  // comes from the ephemeris; this contains no painted sun or invented skyline.
  const environment = make('#c8d7db', (ctx, size) => {
    const sky = ctx.createLinearGradient(0, 0, 0, size);
    sky.addColorStop(0, '#819fac'); sky.addColorStop(.30, '#a7c2cc');
    sky.addColorStop(.49, '#e3e6de'); sky.addColorStop(.53, '#aaa992');
    sky.addColorStop(.72, '#737c60'); sky.addColorStop(1, '#454d3d');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, size, size);
  }, 256);
  environment.mapping = THREE.EquirectangularReflectionMapping;
  return {stone, stucco, wood, grass, foliage, pineNeedles, bark, roof, water, textiles, environment,
    dispose() { [stone, stucco, wood, grass, foliage, pineNeedles, bark, roof, water, textiles, environment].forEach(texture => texture.dispose()); }};
}
