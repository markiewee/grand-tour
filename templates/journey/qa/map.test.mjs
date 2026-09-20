// The route map, without a browser. Run with: node --test qa/map.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectStops, cityLabels } from '../public/js/map.js';

const geo = (lat, lng, extra = {}) => ({ geo: { lat, lng }, ...extra });
const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('north is up and the road fits inside the box', () => {
  const pts = projectStops([geo(1.35, 103.99), geo(34.69, 135.50), geo(35.01, 135.76)]);
  assert.ok(pts[0][1] > pts[1][1], 'Singapore should sit below Osaka');
  assert.ok(pts[1][1] > pts[2][1], 'Osaka should sit below Kyoto');
  for (const [x, y] of pts) {
    assert.ok(x >= 0 && x <= 390, `x ${x} is outside the box`);
    assert.ok(y >= 0 && y <= 520, `y ${y} is outside the box`);
  }
});

test('a journey that runs north to south is not stretched sideways', () => {
  // Two degrees of latitude and two of longitude at latitude 60, where a degree of longitude is
  // half a degree of latitude on the ground. The drawn road should be about twice as tall as wide.
  const pts = projectStops([geo(59, 10), geo(61, 12)]);
  const dx = Math.abs(pts[0][0] - pts[1][0]), dy = Math.abs(pts[0][1] - pts[1][1]);
  assert.ok(dy / dx > 1.6 && dy / dx < 2.6, `ratio was ${(dy / dx).toFixed(2)}`);
});

test('stops at the same address are pushed apart, in order', () => {
  const door = [geo(35.0, 135.0), geo(35.0, 135.0), geo(35.0, 135.0), geo(35.0, 135.0), geo(36.0, 135.5)];
  const pts = projectStops(door);
  for (let i = 1; i < 4; i++) {
    assert.ok(gap(pts[i], pts[i - 1]) >= 20, `stops ${i - 1} and ${i} are ${gap(pts[i], pts[i - 1]).toFixed(1)} apart`);
  }
});

test('a pushed stop alternates sides, which is what makes the road zigzag', () => {
  const pts = projectStops([geo(35, 135), geo(35, 135), geo(35, 135), geo(36, 135)]);
  const side = (p, a, b) => Math.sign((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
  assert.notEqual(side(pts[1], pts[0], pts[3]), side(pts[2], pts[0], pts[3]));
});

test('a hand placed stop keeps its point exactly', () => {
  const pts = projectStops([{ xy: [100, 200], geo: { lat: 1, lng: 1 } }, geo(35, 135)]);
  assert.deepEqual(pts[0], [100, 200]);
});

test('a stop with neither coordinates nor a point sits between its neighbours', () => {
  const pts = projectStops([geo(1, 103), {}, geo(35, 135)]);
  assert.ok(pts[1][1] < pts[0][1], 'it should be above the first stop');
  assert.ok(pts[1][1] > pts[2][1], 'and below the last');
});

test('trailing stops with no place still land on the road', () => {
  const pts = projectStops([geo(1, 103), geo(35, 135), { kind: 'midnight' }, { kind: 'book' }]);
  assert.equal(pts.length, 4);
  for (const [x, y] of pts) assert.ok(Number.isFinite(x) && Number.isFinite(y));
});

test('two stops is enough, and one or none does not throw', () => {
  assert.equal(projectStops([geo(1, 103), geo(35, 135)]).length, 2);
  assert.equal(projectStops([geo(1, 103)]).length, 1);
  assert.equal(projectStops([]).length, 0);
});

test('fifty stops in one city all fit in the box', () => {
  const many = Array.from({ length: 50 }, () => geo(35.01, 135.76));
  const pts = projectStops(many);
  for (const [x, y] of pts) {
    assert.ok(x >= 0 && x <= 390 && y >= 0 && y <= 520, `${x},${y} is outside the box`);
  }
});

test('a city is labelled once, on the roomier side', () => {
  const stops = [geo(35.0, 135.7, { city: 'Kyoto' }), geo(35.1, 135.8, { city: 'Kyoto' }), geo(34.7, 135.5, { city: 'Osaka' })];
  const labels = cityLabels(stops, projectStops(stops));
  assert.deepEqual(labels.map((l) => l.city), ['Kyoto', 'Osaka']);
  for (const l of labels) assert.ok(['start', 'end'].includes(l.anchor));
});

test('a city label points back at that city first stop', () => {
  const stops = [geo(1.35, 103.99, { city: 'Singapore' }), geo(34.7, 135.5, { city: 'Osaka' }), geo(34.7, 135.5, { city: 'Osaka' })];
  const labels = cityLabels(stops, projectStops(stops));
  assert.equal(labels.find((l) => l.city === 'Osaka').first, 1);
});

test('a stop with no city is not labelled', () => {
  const stops = [geo(35, 135, { city: 'Kyoto' }), { kind: 'book' }];
  assert.equal(cityLabels(stops, projectStops(stops)).length, 1);
});

test('no two stops end up within a finger of each other', () => {
  // A journey that opens with a long haul flight: one stop five thousand kilometres from the rest.
  const stops = [
    geo(1.3592, 103.9894), geo(34.6687, 135.5030), geo(34.9671, 135.7727), geo(35.0271, 135.7947),
    geo(35.0048, 135.7707), geo(35.0116, 135.7681), geo(35.0131, 135.6781), geo(35.0037, 135.7811),
    geo(35.0388, 135.7712), geo(34.9858, 135.7588),
  ];
  const pts = projectStops(stops);
  for (let i = 0; i < pts.length; i++) {
    for (let k = i + 1; k < pts.length; k++) {
      assert.ok(gap(pts[i], pts[k]) >= 22, `stops ${i} and ${k} are ${gap(pts[i], pts[k]).toFixed(1)} apart`);
    }
  }
});

test('a hand placed stop is not pushed by its neighbours', () => {
  const pts = projectStops([{ xy: [180, 260] }, geo(35, 135), geo(35, 135), geo(35.0001, 135.0001)]);
  assert.deepEqual(pts[0], [180, 260]);
});

test('fifty stops in one city are all separated from each other', () => {
  const pts = projectStops(Array.from({ length: 50 }, () => geo(35.01, 135.76)));
  let worst = Infinity;
  for (let i = 0; i < pts.length; i++) for (let k = i + 1; k < pts.length; k++) worst = Math.min(worst, gap(pts[i], pts[k]));
  assert.ok(worst >= 16, `the closest pair is ${worst.toFixed(1)} apart`);
});

test('one stop far from the rest does not squeeze them into a corner', () => {
  // Singapore, then nine stops in Osaka and Kyoto: the flight out is five thousand kilometres and
  // everything else is inside thirty. The nine should still fill most of the map.
  const stops = [
    geo(1.3592, 103.9894), geo(34.6687, 135.5030), geo(34.9671, 135.7727), geo(35.0271, 135.7947),
    geo(35.0048, 135.7707), geo(35.0116, 135.7681), geo(35.0131, 135.6781), geo(35.0037, 135.7811),
    geo(35.0388, 135.7712), geo(34.9858, 135.7588),
  ];
  const japan = projectStops(stops).slice(1);
  const w = Math.max(...japan.map((p) => p[0])) - Math.min(...japan.map((p) => p[0]));
  const h = Math.max(...japan.map((p) => p[1])) - Math.min(...japan.map((p) => p[1]));
  assert.ok(w > 390 * .45, `the nine stops span only ${w.toFixed(0)}px across`);
  assert.ok(h > 520 * .35, `the nine stops span only ${h.toFixed(0)}px down`);
});

test('the far stop still sits in the right direction', () => {
  const stops = [
    geo(1.3592, 103.9894), geo(34.6687, 135.5030), geo(34.9671, 135.7727),
    geo(35.0271, 135.7947), geo(35.0116, 135.7681),
  ];
  const pts = projectStops(stops);
  assert.ok(pts[0][1] > Math.max(...pts.slice(1).map((p) => p[1])), 'Singapore is south of all of them');
  assert.ok(pts[0][0] < Math.min(...pts.slice(1).map((p) => p[0])), 'and west of all of them');
});

test('a journey with no runaway gap is left where its coordinates put it', () => {
  // Four stops evenly spread: nothing swallows the map, so nothing is compressed.
  const even = [geo(30, 130), geo(32, 132), geo(34, 134), geo(36, 136)];
  const pts = projectStops(even);
  const d1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
  const d2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
  assert.ok(Math.abs(d1 - d2) < 3, `even spacing became ${d1.toFixed(1)} and ${d2.toFixed(1)}`);
});

test('a journey with no coordinates yet still gets a road, not a pile', () => {
  const pts = projectStops([{}, {}, {}, {}]);
  for (let i = 1; i < pts.length; i++) {
    assert.ok(pts[i][1] < pts[i - 1][1], `stop ${i} should sit above stop ${i - 1}`);
    assert.ok(gap(pts[i], pts[i - 1]) >= 26, `and ${gap(pts[i], pts[i - 1]).toFixed(0)}px clear of it`);
  }
});

test('one stop with coordinates among several without does not pile the rest up', () => {
  const pts = projectStops([{}, geo(35, 135), {}, {}]);
  for (let i = 0; i < pts.length; i++) {
    for (let k = i + 1; k < pts.length; k++) assert.ok(gap(pts[i], pts[k]) >= 20);
  }
});
