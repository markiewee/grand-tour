// Where each envelope sits on the drawn road.
//
// This began as a table of twenty five points placed by hand for one trip up one country. A
// journey belonging to someone else has different stops in a different place, so the points now
// come from the coordinates the stops already carry. A journey that wants the hand placed
// version back can still set stop.xy, and that point is kept exactly as given.

const W = 390, H = 520, PAD = 54;
const MIN = 26;    // how close two stops may sit before one gets pushed along the road
const KICK = 16;   // how far off the line a pushed stop goes, alternating sides

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function projectStops(stops, w = W, h = H, pad = PAD) {
  const pts = stops.map((s) => (s && Array.isArray(s.xy) ? s.xy.slice() : null));
  // A point given by hand is an instruction, not a suggestion, so nothing below moves it.
  const pinned = pts.map(Boolean);
  const geo = stops.filter((s) => s && s.geo);
  if (geo.length >= 2) {
    const lats = geo.map((s) => s.geo.lat);
    // A degree of longitude covers less ground the further you are from the equator. Without the
    // cosine, a journey that runs north to south comes out stretched sideways.
    const k = Math.cos(((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI / 180) || 1;
    const lngs = geo.map((s) => s.geo.lng * k);
    const X = axis(lngs), Y = axis(lats);
    const scale = Math.min((w - pad * 2) / X.span, (h - pad * 2) / Y.span);
    const ox = (w - X.span * scale) / 2, oy = (h - Y.span * scale) / 2;
    stops.forEach((s, i) => {
      if (pts[i] || !s || !s.geo) return;
      // north is up, and y grows downwards in an svg
      pts[i] = [ox + X.at(s.geo.lng * k) * scale, oy + (Y.span - Y.at(s.geo.lat)) * scale];
    });
  }
  if (geo.length < 2) ladder(pts, w, h, pad);
  fill(pts, w, h);
  spread(pts, pinned);
  relax(pts, w, h, pinned);
  return pts.map(([x, y], i) => (pinned[i] ? [x, y] : [Math.round(clamp(x, 8, w - 8)), Math.round(clamp(y, 8, h - 8))]));
}


// One stop thousands of kilometres from the rest, which is exactly what the flight out looks like,
// takes up almost the whole map on its own and leaves the journey itself squeezed into a corner,
// nine dots inside a fingertip. A gap that swallows the map like that is shrunk until it takes
// about a fifth of it. The order and the direction survive, and the rest of the stops get room to
// be told apart. A journey with no such gap is left exactly as the coordinates put it.
const SWALLOWS = .45, LEAVES = .22;

function axis(values) {
  const uniq = [...new Set(values)].sort((a, b) => a - b);
  const raw = uniq[uniq.length - 1] - uniq[0];
  const plain = { span: Math.max(raw, 1e-9), at: (v) => v - uniq[0] };
  if (uniq.length < 4 || raw <= 0) return plain;

  const gaps = uniq.slice(1).map((v, i) => v - uniq[i]);
  const biggest = Math.max(...gaps);
  if (biggest < raw * SWALLOWS) return plain;

  const rest = raw - biggest;
  const shrunk = rest > 0 ? (LEAVES / (1 - LEAVES)) * rest : biggest;
  const moved = new Map([[uniq[0], 0]]);
  let at = 0;
  gaps.forEach((g, i) => {
    at += g === biggest ? shrunk : g;
    moved.set(uniq[i + 1], at);
  });
  return { span: Math.max(at, 1e-9), at: (v) => (moved.has(v) ? moved.get(v) : v - uniq[0]) };
}


// A journey whose stops have no coordinates yet, which is what a freshly scaffolded one looks
// like, has nothing to project. Rather than pile every envelope on one pixel in the middle of the
// screen, walk them up the page in a gentle zigzag so the road still reads as a road.
function ladder(pts, w, h, pad) {
  const empty = pts.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0);
  if (empty.length < 2) return;
  const top = pad, bottom = h - pad;
  empty.forEach((at, n) => {
    const f = n / (empty.length - 1);
    pts[at] = [w / 2 + (n % 2 ? 1 : -1) * w * .15, bottom - f * (bottom - top)];
  });
}

// A stop with no coordinates and no point of its own goes between its neighbours. The midnight
// stop and the book are the usual case: they belong to a moment rather than to a place.
function fill(pts, w, h) {
  for (let i = 0; i < pts.length; i++) {
    if (pts[i]) continue;
    let a = i - 1, b = i + 1;
    while (a >= 0 && !pts[a]) a--;
    while (b < pts.length && !pts[b]) b++;
    if (a < 0 && b >= pts.length) { pts[i] = [w / 2, h / 2]; continue; }
    if (a < 0) { pts[i] = [pts[b][0], pts[b][1] + 20]; continue; }
    if (b >= pts.length) { pts[i] = [pts[a][0], pts[a][1] - 20]; continue; }
    const t = (i - a) / (b - a);
    pts[i] = [pts[a][0] + (pts[b][0] - pts[a][0]) * t, pts[a][1] + (pts[b][1] - pts[a][1]) * t];
  }
}

// Five envelopes at one hotel door project onto the same pixel and the road disappears. Walk the
// stops in order and move any that lands on top of the one before it further along the road,
// alternating which side of the line it sits on. The zigzag is a side effect of this.
function spread(pts, pinned) {
  let side = 1;
  for (let i = 1; i < pts.length; i++) {
    // Against every stop already placed, not just the one before it. Checking only the previous
    // stop lets the third envelope at a door step back onto the first, which looks fine while the
    // road is being drawn and is wrong the moment anybody taps it.
    if (pinned[i] || !crowded(pts, i)) { side = 1; continue; }
    const [px, py] = pts[i - 1];
    const [hx, hy] = heading(pts, i);
    pts[i] = [px + hx * MIN - hy * KICK * side, py + hy * MIN + hx * KICK * side];
    side = -side;
  }
}

function crowded(pts, i) {
  for (let k = 0; k < i; k++) {
    if (Math.hypot(pts[i][0] - pts[k][0], pts[i][1] - pts[k][1]) < MIN) return true;
  }
  return false;
}

// Walking the road in order only separates each stop from the one before it, and that is not
// enough. A journey that opens with a long haul flight puts one stop thousands of kilometres from
// the rest, which squeezes everything else into a clump barely wider than a fingertip. The stops
// then zigzag back across each other, and a tap meant for the second envelope opens the eighth,
// because the later one is drawn on top. So push every pair that is still too close apart, a few
// times over, until no two stops are within a finger of each other.
function relax(pts, w, h, pinned) {
  for (let pass = 0; pass < 24; pass++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++) {
      for (let k = i + 1; k < pts.length; k++) {
        let dx = pts[k][0] - pts[i][0], dy = pts[k][1] - pts[i][1];
        let d = Math.hypot(dx, dy);
        if (d >= MIN) continue;
        // Two stops on exactly the same pixel have no direction to be pushed apart along, so
        // give them one rather than dividing by zero.
        if (d < 1e-6) { dx = Math.cos(i * 2.399); dy = Math.sin(i * 2.399); d = 1; }
        // A pinned stop does not budge, so the other one takes the whole distance.
        const share = pinned[i] === pinned[k] ? 2 : 1;
        const push = (MIN - d) / share / d;
        if (!pinned[i]) pts[i] = [pts[i][0] - dx * push, pts[i][1] - dy * push];
        if (!pinned[k]) pts[k] = [pts[k][0] + dx * push, pts[k][1] + dy * push];
        moved = !pinned[i] || !pinned[k];
      }
    }
    for (let i = 0; i < pts.length; i++) {
      if (!pinned[i]) pts[i] = [clamp(pts[i][0], 14, w - 14), clamp(pts[i][1], 14, h - 14)];
    }
    if (!moved) return;
  }
}

// Which way the road is going here, taken from the nearest stop that is not on top of this one.
function heading(pts, i) {
  const [x, y] = pts[i];
  for (let j = i + 1; j < pts.length; j++) {
    const dx = pts[j][0] - x, dy = pts[j][1] - y, d = Math.hypot(dx, dy);
    if (d > 1) return [dx / d, dy / d];
  }
  for (let j = i - 2; j >= 0; j--) {
    const dx = x - pts[j][0], dy = y - pts[j][1], d = Math.hypot(dx, dy);
    if (d > 1) return [dx / d, dy / d];
  }
  return [0, -1];
}

// One label per city, at the top of that city's stops, on whichever side has more room. first is
// the index of that city's first stop, which the caller uses to print the date underneath.
export function cityLabels(stops, pts, w = W) {
  const seen = new Map();
  stops.forEach((s, i) => {
    if (!s || !s.city || !pts[i]) return;
    const e = seen.get(s.city) || { city: s.city, xs: [], ys: [], first: i };
    e.xs.push(pts[i][0]); e.ys.push(pts[i][1]);
    seen.set(s.city, e);
  });
  return [...seen.values()].map((e) => {
    const cx = e.xs.reduce((a, b) => a + b, 0) / e.xs.length;
    const right = cx < w / 2;
    // Beside the edge of the city's stops, not beside their middle. Measuring from the middle put
    // the last letter of a spread out city underneath one of its own envelopes.
    const edge = right ? Math.max(...e.xs) + 24 : Math.min(...e.xs) - 24;
    return {
      city: e.city, first: e.first, anchor: right ? 'start' : 'end',
      x: Math.round(clamp(edge, 12, w - 12)),
      y: Math.round(clamp(Math.min(...e.ys) - 8, 22, 500)),
    };
  });
}
