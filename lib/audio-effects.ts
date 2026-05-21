/**
 * Polyfill-guarded Audio and Haptic Feedbacks for Wisp
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    // Standard audio context initialization
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
}

/**
 * Play a beautiful, dual-tone synthesized iOS-style chime for incoming whispers.
 */
export function playReceiveSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Resume context if browser suspended it (due to autoplay/interaction policies)
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  try {
    const now = ctx.currentTime;

    // Harmonic double chime
    // Tone 1: soft intermediate C
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    
    osc1.type = 'triangle'; // Mellower and softer than a sine or square wave
    osc1.frequency.setValueAtTime(523.25, now); // C5
    // Gently slide the frequency up slightly for high visual premium detail
    osc1.frequency.exponentialRampToValueAtTime(587.33, now + 0.15); // D5

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.2, now + 0.03);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    // Tone 2: high clean resolving chime, slightly offset
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(783.99, now + 0.08); // G5
    osc2.frequency.exponentialRampToValueAtTime(880.00, now + 0.25); // A5

    gain2.gain.setValueAtTime(0, now + 0.08);
    gain2.gain.linearRampToValueAtTime(0.15, now + 0.11);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    // Start & Stop triggers
    osc1.start(now);
    osc1.stop(now + 0.4);

    osc2.start(now + 0.08);
    osc2.stop(now + 0.6);
  } catch (e) {
    console.warn('[Wisp Audio] Failed to play incoming sound:', e);
  }
}

/**
 * Play a very soft, muted low-high double tap for background/unread messages when scrolled up.
 */
export function playUnreadReceiveSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  try {
    const now = ctx.currentTime;

    // Soft, low-frequency muted double-pop/woodblock sound
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(330, now); // E4

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.08, now + 0.01);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    // Second slightly higher tone
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(440, now + 0.06); // A4

    gain2.gain.setValueAtTime(0, now + 0.06);
    gain2.gain.linearRampToValueAtTime(0.06, now + 0.07);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.1);

    osc2.start(now + 0.06);
    osc2.stop(now + 0.2);
  } catch (e) {
    console.warn('[Wisp Audio] Failed to play unread incoming sound:', e);
  }
}

/**
 * Play a light "upward swoop" or soft "pop" for sent messages
 */
export function playSendSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  try {
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Frequency pitch slide upwards (whoosh/bubble aesthetic)
    osc.frequency.setValueAtTime(320.0, now);
    osc.frequency.exponentialRampToValueAtTime(640.0, now + 0.12);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  } catch (e) {
    console.warn('[Wisp Audio] Failed to play outgoings sound:', e);
  }
}

/**
 * Native Haptic Feedback pattern triggers (guarded)
 */
export function triggerHaptic(type: 'light' | 'success' | 'double') {
  if (typeof window === 'undefined') return;
  
  if (window.navigator && window.navigator.vibrate) {
    try {
      if (type === 'light') {
        window.navigator.vibrate(12); // Single subtle tap
      } else if (type === 'success') {
        window.navigator.vibrate([15, 20, 10]); // Multi rhythm tap
      } else if (type === 'double') {
        window.navigator.vibrate([15, 30, 15]); // Strong double tick
      }
    } catch (e) {
      // Browsers secure block untriggered vibrations occasionally, fail silently
    }
  }
}
