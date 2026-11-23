import { CANVAS_W, ARENA_H } from './config.js';

/**
 * Renders Jevil's iconic 3D-perspective revolving carousel chamber!
 * Combines the official ripped grayscale carousel horse photograph (scrolling in cylindrical parallax)
 * with the bold rotating perspective blue/indigo (or crimson/violet in Chaos Mode) radial cylinder panels
 * matching the authentic Deltarune Chapter 1 arena!
 */
export class CarouselBackground {
  constructor() {
    this.angle = 0;
    this.photoScroll = 0;
    this.pulse = 0;
  }

  update(dt, speedFactor = 1.0, bgSpinSetting = 'normal') {
    let mult = 1.0;
    if (bgSpinSetting === 'reduced') mult = 0.25;
    if (bgSpinSetting === 'static') mult = 0;

    this.angle += dt * 0.72 * speedFactor * mult;
    this.photoScroll += dt * 62 * speedFactor * mult;
    this.pulse += dt * 2.2;
  }

  draw(ctx, assets, modeCfg, opts = {}) {
    const w = CANVAS_W;
    const h = opts.fullHeight ? 480 : ARENA_H;
    const cx = w / 2;
    const cy = h * 0.48;
    const isChaos = modeCfg.id === 'chaos';

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();

    // 1. Deep void background
    ctx.fillStyle = isChaos ? '#09000d' : '#03020d';
    ctx.fillRect(0, 0, w, h);

    // 2. Official grayscale carousel horse photo scrolling & curved along the distant chamber wall
    const bgImg = assets.getImage('carousel_bg');
    if (bgImg) {
      const stripH = h * 0.74;
      const stripY = cy - stripH / 2;
      const scale = stripH / bgImg.height;
      const drawW = bgImg.width * scale;
      const offset = ((this.photoScroll % drawW) + drawW) % drawW;

      ctx.save();
      ctx.globalAlpha = isChaos ? 0.30 : 0.24;
      for (let x = -offset; x < w + drawW; x += drawW) {
        ctx.drawImage(bgImg, Math.floor(x), Math.floor(stripY), Math.ceil(drawW), Math.ceil(stripH));
      }
      // Subtle tint over the carousel photo
      ctx.globalAlpha = 1;
      ctx.fillStyle = modeCfg.bgTint.photoTint;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // 3. Authentic 3D-perspective curved rotating cylinder ceiling & floor wedges!
    // Matches the hourglass-pinched alternating blue/navy panels in screenshots 1-5.
    const panels = 12;
    const step = (Math.PI * 2) / panels;
    const radiusX = w * 0.84;
    const neckHalfH = h * 0.14;
    const outerHalfH = h * 0.74;

    const drawBand = (isTop) => {
      const sign = isTop ? -1 : 1;
      for (let i = 0; i < panels; i++) {
        const a0 = this.angle + i * step;
        const a1 = a0 + step;
        const mid = (a0 + a1) * 0.5;
        const cosM = Math.cos(mid);
        // Only draw front/side facing panels of the interior cylinder
        if (cosM < -0.35) continue;

        const x0Out = cx + Math.sin(a0) * radiusX;
        const x1Out = cx + Math.sin(a1) * radiusX;
        const x0In = cx + Math.sin(a0) * (radiusX * 0.17);
        const x1In = cx + Math.sin(a1) * (radiusX * 0.17);

        const depth0 = Math.max(0.08, (Math.cos(a0) + 1) * 0.5);
        const depth1 = Math.max(0.08, (Math.cos(a1) + 1) * 0.5);

        const y0Out = cy + sign * (neckHalfH + outerHalfH * depth0);
        const y1Out = cy + sign * (neckHalfH + outerHalfH * depth1);
        const y0In = cy + sign * (neckHalfH * (0.5 + 0.55 * depth0));
        const y1In = cy + sign * (neckHalfH * (0.5 + 0.55 * depth1));

        const even = i % 2 === 0;
        const shade = 0.45 + 0.55 * Math.max(0, cosM);

        if (isChaos) {
          const pulseGlow = Math.sin(this.pulse + i) * 14;
          const r = Math.min(255, Math.floor((even ? 135 : 42) * shade + (even ? pulseGlow : 0)));
          const g = Math.floor((even ? 12 : 6) * shade);
          const b = Math.min(255, Math.floor((even ? 112 : 52) * shade));
          ctx.fillStyle = `rgb(${r},${g},${b})`;
        } else {
          const r = Math.floor((even ? 8 : 2) * shade);
          const g = Math.floor((even ? 12 : 4) * shade);
          const b = Math.min(255, Math.floor((even ? 186 : 62) * shade));
          ctx.fillStyle = `rgb(${r},${g},${b})`;
        }

        ctx.beginPath();
        ctx.moveTo(x0In, y0In);
        ctx.lineTo(x1In, y1In);
        ctx.lineTo(x1Out, y1Out);
        ctx.lineTo(x0Out, y0Out);
        ctx.closePath();
        ctx.fill();
      }
    };

    // Draw back pillars connecting upper & lower cylinder rings
    for (let i = 0; i < panels; i++) {
      const a0 = this.angle + i * step;
      const a1 = a0 + step;
      const mid = (a0 + a1) * 0.5;
      if (Math.cos(mid) < -0.1) continue;
      if (i % 2 !== 0) continue;

      const x0 = cx + Math.sin(a0) * (radiusX * 0.17);
      const x1 = cx + Math.sin(a1) * (radiusX * 0.17);
      const d0 = (Math.cos(a0) + 1) * 0.5;
      const d1 = (Math.cos(a1) + 1) * 0.5;

      ctx.fillStyle = isChaos ? 'rgba(95, 10, 75, 0.52)' : 'rgba(6, 12, 130, 0.52)';
      ctx.beginPath();
      ctx.moveTo(x0, cy - neckHalfH * (0.5 + 0.55 * d0));
      ctx.lineTo(x1, cy - neckHalfH * (0.5 + 0.55 * d1));
      ctx.lineTo(x1, cy + neckHalfH * (0.5 + 0.55 * d1));
      ctx.lineTo(x0, cy + neckHalfH * (0.5 + 0.55 * d0));
      ctx.closePath();
      ctx.fill();
    }

    drawBand(true);
    drawBand(false);

    // 4. Subtle dark vignette at horizon and top/bottom edges so white bullets pop with 100% clarity!
    const vGrad = ctx.createLinearGradient(0, 0, 0, h);
    vGrad.addColorStop(0, 'rgba(0, 0, 0, 0.62)');
    vGrad.addColorStop(0.25, 'rgba(0, 0, 0, 0.12)');
    vGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.25)');
    vGrad.addColorStop(0.75, 'rgba(0, 0, 0, 0.12)');
    vGrad.addColorStop(1, 'rgba(0, 0, 0, 0.68)');
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, w, h);

    // Darken slightly during bullet-hell phase (authentic Deltarune contrast!)
    if (opts.bulletDim) {
      ctx.fillStyle = `rgba(0, 0, 0, ${opts.bulletDim})`;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.restore();
  }
}
