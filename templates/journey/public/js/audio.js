// Every sound is made in the browser, so nothing has to download and it all works offline.
let ac = null;
export function audio() {
  if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
function noise(dur, type, freq, q, gain, when = 0) {
  const a = audio(); const len = Math.floor(a.sampleRate * dur); const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const s = a.createBufferSource(); s.buffer = buf; const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = a.createGain(); g.gain.value = gain; s.connect(f).connect(g).connect(a.destination); s.start(a.currentTime + when);
}
function tone(freq, dur, gain, when = 0, type = 'sine') {
  const a = audio(); const o = a.createOscillator(); o.type = type; o.frequency.value = freq; const g = a.createGain();
  const t = a.currentTime + when; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .05);
}
const safe = (fn) => () => { try { fn(); } catch (e) { /* no audio on this device */ } };
export const sfx = {
  crack: safe(() => { noise(.09, 'bandpass', 2600, 1.2, .9); noise(.05, 'highpass', 4200, .7, .5, .03); tone(92, .16, .5); }),
  paper: safe(() => noise(.42, 'lowpass', 1500, .6, .35)),
  press: safe(() => { tone(70, .12, .22); noise(.05, 'lowpass', 600, .8, .15); }),
  chime: safe(() => { tone(880, 1.6, .12); tone(1318.5, 1.9, .07, .06); tone(1760, 2.2, .04, .12); }),
  slide: safe(() => { noise(.75, 'lowpass', 900, .5, .28); noise(.5, 'bandpass', 2400, .8, .06, .2); }),
  fold: safe(() => { noise(.14, 'bandpass', 1900, .9, .32); noise(.22, 'lowpass', 700, .7, .18, .04); }),
  nope: safe(() => { tone(180, .09, .12); tone(150, .12, .1, .09); }),
  bell: safe(() => { [0, .5, 1.0].forEach((w, i) => { tone(523.25 * (i === 2 ? 1.5 : 1), 2.4, .08, w); tone(1046.5, 1.8, .03, w); }); }),
};
