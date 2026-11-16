/** Jednoduché zvukové signály (WebAudio, žádné soubory). Zvuk je volitelný a ve výchozím stavu vypnutý. */
let ctx: AudioContext | null = null;

/** Zavolat při kliknutí uživatele (prohlížeče povolí zvuk až po interakci). */
export function unlockAudio(): void {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* zvuk není dostupný */
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.14): void {
  if (!ctx) return;
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export type SoundKind = 'ok' | 'error' | 'hop';

export function playSound(kind: SoundKind, enabled: boolean): void {
  if (!enabled) return;
  unlockAudio();
  if (!ctx) return;
  if (kind === 'ok') { tone(523.25, 0, 0.16); tone(659.25, 0.12, 0.16); tone(783.99, 0.24, 0.28); }
  else if (kind === 'error') { tone(220, 0, 0.22, 'sawtooth', 0.1); tone(164.81, 0.2, 0.34, 'sawtooth', 0.1); }
  else tone(880, 0, 0.07, 'square', 0.05);
}
