/** A small, entirely synthesized soundscape; nothing is fetched or recorded. */
export function createSoundscape() {
  let context: AudioContext | null = null;
  let bus: GainNode | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let enabled = false;
  let revision = 0;
  let disposed = false;
  let note = 0;
  const tones = [196, 246.94, 293.66, 369.99, 392, 493.88, 587.33];
  function chime(frequency: number, duration = 2.8, volume = .1, delay = 0) {
    if (!enabled || !context || !bus) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + .018);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain).connect(bus);
    oscillator.start(start);
    oscillator.stop(start + duration + .02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  function ambient() {
    chime(tones[(note * 3 + Math.floor(note / 4)) % tones.length] / 2, 4, .035);
    if (note % 3 === 0) chime(tones[(note + 2) % tones.length], 3, .012, .35);
    note++;
  }
  return {
    async setEnabled(value: boolean) {
      if (disposed) return;
      const current = ++revision;
      enabled = value;
      if (timer) clearInterval(timer);
      timer = null;
      if (!value) { if (context) await context.suspend(); return; }
      if (!context) { context = new AudioContext(); bus = context.createGain(); bus.gain.value = .6; bus.connect(context.destination); }
      await context.resume();
      if (disposed || current !== revision || !enabled) return;
      ambient();
      timer = setInterval(ambient, 2200);
    },
    collect() { [493.88, 587.33, 783.99].forEach((frequency, i) => chime(frequency, 1.1, .075, i * .11)); },
    discover() { chime(293.66, 1.2, .08); chime(440, 1.5, .04, .13); },
    complete() { [196, 246.94, 293.66, 392, 493.88, 587.33, 783.99].forEach((frequency, i) => chime(frequency, 3, .07, i * .17)); },
    async destroy() { disposed = true; revision++; enabled = false; if (timer) clearInterval(timer); timer = null; if (context) await context.close(); context = null; bus = null; },
  };
}
