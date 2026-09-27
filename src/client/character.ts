import type { AdventureDocument } from '../shared/adventure/document.js';
/** Canvas-compatible composition, also used by the editor preview. */
export function composeCharacter(
  image: HTMLImageElement | HTMLCanvasElement,
  tint: string,
  accessory: AdventureDocument['hero']['accessory'],
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 320;
  const ctx = canvas.getContext('2d')!;
  const scale = Math.min(256 / image.width, 320 / image.height),
    w = image.width * scale,
    h = image.height * scale,
    x = (256 - w) / 2,
    y = 320 - h;
  const draw = () => ctx.drawImage(image, x, y, w, h);
  draw();
  if (tint.toLowerCase() !== '#ffffff') {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, 256, 320);
    ctx.globalCompositeOperation = 'destination-in';
    draw();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.strokeStyle = '#405c57';
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  if (accessory === 'scarf') {
    ctx.fillStyle = '#567f9a';
    ctx.beginPath();
    ctx.moveTo(70, 198);
    ctx.quadraticCurveTo(128, 218, 184, 198);
    ctx.lineTo(180, 222);
    ctx.lineTo(141, 228);
    ctx.lineTo(160, 260);
    ctx.lineTo(130, 274);
    ctx.lineTo(117, 226);
    ctx.lineTo(76, 222);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (accessory === 'hat') {
    ctx.fillStyle = '#e3b671';
    ctx.beginPath();
    ctx.moveTo(78, 60);
    ctx.lineTo(92, 14);
    ctx.quadraticCurveTo(128, 4, 164, 14);
    ctx.lineTo(178, 60);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#709887';
    ctx.fillRect(86, 44, 86, 14);
    ctx.fillStyle = '#e3b671';
    ctx.beginPath();
    ctx.ellipse(128, 64, 70, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  return canvas;
}
