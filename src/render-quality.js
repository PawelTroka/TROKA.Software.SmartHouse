// Bound the backing buffer independently of the CSS viewport. The frame budget
// changes only whilst navigating in Auto; geometry and camera poses are fixed.
export function renderBudget(quality, width, height, deviceRatio = 1, options = {}) {
  const mode = ['eco', 'high'].includes(quality) ? quality : 'auto';
  const constrained = options.memoryGB > 0 && options.memoryGB <= 4;
  const moving = mode === 'auto' && options.interacting;
  const pixels = mode === 'eco' ? 720000 : mode === 'high' ? 4000000 :
    moving ? 900000 : constrained ? 1152000 : 2100000;
  const ratioCap = mode === 'eco' ? 1 : mode === 'high' ? 2 : moving ? 1.2 : 1.75;
  const pixelRatio = Math.min(Math.max(.1, deviceRatio || 1), ratioCap,
    Math.sqrt(pixels / Math.max(1, width * height)));
  const target = mode === 'eco' || (mode === 'auto' && (constrained || width < 600)) ? 1024 : mode === 'high'?4096:2048;
  const hardwareLimit = Math.max(1, options.maxTextureSize || 2048);
  const shadowSize = Math.min(target, 2 ** Math.floor(Math.log2(hardwareLimit)));
  return {pixelRatio, shadowSize, motionFps: mode === 'eco' || constrained ? 15 : 24};
}
