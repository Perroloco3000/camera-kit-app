/**
 * Shutter sound via Web Audio API (short click)
 */
export function playShutterSound(): void {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 1200;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  } catch {
    // ignore
  }
}

/**
 * Haptic feedback (vibration) on supported devices
 */
export function hapticLight(): void {
  if ('vibrate' in navigator) {
    navigator.vibrate(10);
  }
}

export function hapticMedium(): void {
  if ('vibrate' in navigator) {
    navigator.vibrate(20);
  }
}
