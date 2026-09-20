// The journey loader and the copy binding, without a browser.
//   node --test qa/journey.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJourney } from '../public/js/trip.js';
import { pick, bindCopy } from '../public/js/bind.js';

const full = {
  journey: {
    title: 'A Journey', for: 'Ren', from: 'Kai', tz: 'Asia/Tokyo', tzCity: 'Kyoto',
    midnight: { at: '2027-04-04T00:00:00+09:00', title: 'Happy birthday, Ren', closes: '2027-04-03T23:59:00+09:00' },
    callback: { at: '2027-05-01T00:00:00+09:00', label: 'Saturday 1 May' },
    letterbox: { title: 'A letterbox for Ren' },
  },
  stops: [],
};

test('the named moments become timestamps', () => {
  const j = parseJourney(full);
  assert.equal(j.midnightAt, Date.parse('2027-04-04T00:00:00+09:00'));
  assert.equal(j.callbackAt, Date.parse('2027-05-01T00:00:00+09:00'));
  assert.equal(j.lettersCloseAt, Date.parse('2027-04-03T23:59:00+09:00'));
  assert.equal(j.hasLetterbox, true);
});

test('letters close at midnight when no earlier closing time is given', () => {
  const j = parseJourney({ journey: { ...full.journey, midnight: { at: '2027-04-04T00:00:00+09:00' } } });
  assert.equal(j.lettersCloseAt, j.midnightAt);
});

test('a journey with no midnight has no letterbox, whatever the letterbox block says', () => {
  const { midnight, ...rest } = full.journey;
  const j = parseJourney({ journey: rest, stops: [] });
  assert.equal(j.midnightAt, null);
  assert.equal(j.hasLetterbox, false);
});

test('a journey with no callback has none, rather than NaN', () => {
  const { callback, ...rest } = full.journey;
  assert.equal(parseJourney({ journey: rest }).callbackAt, null);
});

test('an unparseable moment is null, not a number that sorts wrong', () => {
  const j = parseJourney({ journey: { ...full.journey, midnight: { at: 'the fourth of April' } } });
  assert.equal(j.midnightAt, null);
});

test('a journey block that is missing entirely does not throw', () => {
  const j = parseJourney({});
  assert.equal(j.tz, 'UTC');
  assert.equal(j.hasLetterbox, false);
});

test('a dotted path reads through the journey', () => {
  const j = parseJourney(full);
  assert.equal(pick(j, 'title'), 'A Journey');
  assert.equal(pick(j, 'midnight.title'), 'Happy birthday, Ren');
});

test('a path the journey does not have is undefined, not a crash', () => {
  const j = parseJourney({ journey: { title: 'A' } });
  assert.equal(pick(j, 'callback.label'), undefined);
  assert.equal(pick(j, 'a.b.c.d'), undefined);
});

test('an element that only takes an attribute is left alone when the journey has no value', () => {
  // A placeholder nobody wrote must not take the input away with it.
  const el = { dataset: { j: 'letterbox.namePlaceholder', jAttr: 'placeholder' }, hidden: false,
    setAttribute() { this.set = true; }, removeAttribute() {} };
  const root = { querySelectorAll: () => [el] };
  bindCopy(root, { letterbox: {} });
  assert.equal(el.hidden, false, 'the field is still there to type into');
  assert.equal(el.set, undefined, 'and no empty placeholder was written onto it');
});

test('an element whose words are missing is hidden', () => {
  const el = { dataset: { j: 'callback.label' }, hidden: false, textContent: 'old copy',
    setAttribute() {}, removeAttribute() {} };
  bindCopy({ querySelectorAll: () => [el] }, { });
  assert.equal(el.hidden, true);
  assert.equal(el.textContent, 'old copy', 'and it is not blanked, only hidden');
});
