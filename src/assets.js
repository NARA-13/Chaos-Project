export class AssetManager {
  constructor() {
    this.manifest = {};
    this.images = {};
    this.tintedCache = new Map();
    this.loaded = 0;
    this.total = 0;
  }

  async loadAll(onProgress) {
    const bust = Date.now();
    const res = await fetch(`assets/sprites/manifest.json?v=${bust}`, { cache: 'no-store' });
    this.manifest = await res.json();
    const keys = Object.keys(this.manifest);
    this.total = keys.length;
    this.loaded = 0;

    await Promise.all(
      keys.map(
        (key) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              this.images[key] = img;
              this.loaded++;
              if (onProgress) onProgress(this.loaded, this.total);
              resolve();
            };
            img.onerror = () => {
              console.warn('Failed to load sprite:', key);
              this.loaded++;
              if (onProgress) onProgress(this.loaded, this.total);
              resolve();
            };
            img.src = `${this.manifest[key].file}?v=${bust}`;
          })
      )
    );
  }

  getInfo(key) {
    return this.manifest[key] || null;
  }

  getImage(key) {
    return this.images[key] || null;
  }

  getTinted(key, tintColor) {
    const cacheKey = `${key}__${tintColor}`;
    if (this.tintedCache.has(cacheKey)) return this.tintedCache.get(cacheKey);
    const img = this.images[key];
    if (!img) return null;
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = tintColor;
    g.fillRect(0, 0, c.width, c.height);
    this.tintedCache.set(cacheKey, c);
    return c;
  }

  /**
   * Draw an official sprite frame pixel-perfectly.
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} key
   * @param {number} frame
   * @param {number} x
   * @param {number} y
   * @param {object} opts { scale=2, anchor='center'|'bottom'|'topleft', rotation=0, flipX=false, alpha=1, tint=null }
   */
  draw(ctx, key, frame, x, y, opts = {}) {
    const info = this.manifest[key];
    const baseImg = this.images[key];
    if (!info || !baseImg) return;

    const img = opts.tint ? this.getTinted(key, opts.tint) : baseImg;
    const f = ((Math.floor(frame) % info.frames) + info.frames) % info.frames;
    const sx = f * info.fw;
    const sy = 0;
    const sw = info.fw;
    const sh = info.fh;
    const scale = opts.scale !== undefined ? opts.scale : 2;
    const scaleX = opts.scaleX !== undefined ? opts.scaleX : scale;
    const scaleY = opts.scaleY !== undefined ? opts.scaleY : scale;
    const dw = sw * scaleX;
    const dh = sh * scaleY;
    const anchor = opts.anchor || 'center';

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (opts.alpha !== undefined && opts.alpha !== 1) {
      ctx.globalAlpha *= Math.max(0, Math.min(1, opts.alpha));
    }
    ctx.translate(Math.round(x), Math.round(y));
    if (opts.rotation) ctx.rotate(opts.rotation);
    if (opts.flipX) ctx.scale(-1, 1);

    let dx = -dw / 2;
    let dy = -dh / 2;
    if (anchor === 'bottom') {
      dx = -dw / 2;
      dy = -dh;
    } else if (anchor === 'topleft') {
      dx = 0;
      dy = 0;
    } else if (anchor === 'left') {
      dx = 0;
      dy = -dh / 2;
    }

    ctx.drawImage(img, sx, sy, sw, sh, Math.round(dx), Math.round(dy), Math.round(dw), Math.round(dh));
    ctx.restore();
  }
}
