// The letterbox friends get: a name, a letter, and if they like a voice note or a short video.
//
// The words come here. Anything recorded goes straight from their phone to the file store and only
// its address is posted with the letter, because a server function can take 4.5 MB of body and a
// minute of video is many times that.
import { upload } from '../vendor/blob-client.js';
import { bindCopy } from './bind.js';
import { parseJourney } from './trip.js';

// The letterbox never shows the stops, only the framing copy, so it reads the journey file for
// that and nothing else.
fetch('data/trip.json', { cache: 'no-cache' }).then((r) => r.json())
  .then((raw) => bindCopy(document, parseJourney(raw)))
  .catch(() => { /* the form still works with the words that are already on the page */ });

const $ = (s) => document.querySelector(s);
let voice = null, video = null, rec = null, chunks = [], started = 0, timer = 0;
const MAX_VOICE = 120, MAX_VIDEO = 65;

const err = (t) => { $('#err').textContent = t || ''; };

/* ---------------- voice note ---------------- */
$('#recBtn').addEventListener('click', async () => {
  err();
  if (rec && rec.state === 'recording') { rec.stop(); return; }
  if (!navigator.mediaDevices || !window.MediaRecorder) { err('This browser cannot record. You can still write, or film a video.'); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) { err('The microphone is blocked. Allow it in the browser settings, or write instead.'); return; }
  const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
  rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    clearInterval(timer); stream.getTracks().forEach((t) => t.stop());
    voice = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
    const a = $('#recAudio'); a.src = URL.createObjectURL(voice); a.hidden = false;
    $('#recBtn').innerHTML = 'Record again'; $('#recBtn').className = 'btn ghost';
    $('#recHint').textContent = `${Math.round((Date.now() - started) / 1000)} seconds. Play it back before you seal it.`;
  };
  rec.start(); started = Date.now();
  $('#recBtn').innerHTML = '<span class="dot"></span>Stop'; $('#recBtn').className = 'btn rec';
  timer = setInterval(() => {
    const s = Math.round((Date.now() - started) / 1000);
    $('#recHint').textContent = `Recording, ${s} seconds`;
    if (s >= MAX_VOICE) rec.stop();
  }, 500);
});

/* ---------------- video ---------------- */
$('#vidBtn').addEventListener('click', () => $('#vid').click());
$('#vid').addEventListener('change', () => {
  err(); const f = $('#vid').files[0]; if (!f) return;
  const v = $('#vidPrev'); v.src = URL.createObjectURL(f); v.hidden = false;
  v.onloadedmetadata = () => {
    if (v.duration > MAX_VIDEO) { err('That video is over a minute. Trim it or film a shorter one.'); video = null; v.hidden = true; $('#vidHint').textContent = ''; return; }
    video = f; $('#vidHint').textContent = `${Math.round(v.duration)} seconds`;
    $('#vidBtn').textContent = 'Choose a different video';
  };
});

/* ---------------- seal it ---------------- */
const EXT = { 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/webm': 'webm',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };

function extFor(file, fallback) {
  const mime = (file.type || '').split(';')[0];
  if (EXT[mime]) return EXT[mime];
  const dotted = /\.([A-Za-z0-9]{1,8})$/.exec(file.name || '');
  return dotted ? dotted[1].toLowerCase() : fallback;
}

// One bar for everything being sent, so a voice note and a video read as a single upload.
function progressBar(total) {
  const done = {};
  return (kind, loaded) => {
    done[kind] = loaded;
    const sum = Object.values(done).reduce((a, b) => a + b, 0);
    $('#barFill').style.width = `${Math.min(99, Math.round((sum / total) * 100))}%`;
  };
}

async function send(kind, file, onProgress) {
  const name = `media/${kind}-${Math.random().toString(36).slice(2, 10)}.${extFor(file, kind === 'audio' ? 'webm' : 'mp4')}`;
  const blob = await upload(name, file, {
    access: 'public',
    contentType: (file.type || '').split(';')[0] || (kind === 'audio' ? 'audio/webm' : 'video/mp4'),
    handleUploadUrl: '/api/upload',
    multipart: file.size > 8 * 1024 * 1024,
    onUploadProgress: (p) => onProgress(kind, p.loaded),
  });
  return blob.url;
}

$('#sendBtn').addEventListener('click', async () => {
  err();
  const from = $('#from').value.trim(), text = $('#text').value.trim();
  if (!from) { err('Add your name so they know who it is from.'); $('#from').focus(); return; }
  if (!text && !voice && !video) { err('Write something, or record a voice note or a video.'); $('#text').focus(); return; }
  if (rec && rec.state === 'recording') { err('Stop the recording first.'); return; }

  $('#sendBtn').disabled = true;
  const total = (voice ? voice.size : 0) + (video ? video.size : 0);
  const onProgress = progressBar(total || 1);
  if (total) { $('#bar').hidden = false; $('#barFill').style.width = '0%'; }

  try {
    const [audioUrl, videoUrl] = await Promise.all([
      voice ? send('audio', voice, onProgress) : null,
      video ? send('video', video, onProgress) : null,
    ]);
    const res = await fetch('api/letters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, text, audio: audioUrl, video: videoUrl }),
    });
    const r = await res.json().catch(() => ({}));
    if (!res.ok || !r.ok) throw new Error(r.error || '');
    $('#barFill').style.width = '100%';
    $('#form').hidden = true; $('#done').hidden = false; window.scrollTo(0, 0);
  } catch (e) {
    err(e.message || 'It did not send. Check the connection and try again.');
  } finally {
    $('#sendBtn').disabled = false; $('#bar').hidden = true;
  }
});

$('#again').addEventListener('click', () => location.reload());
