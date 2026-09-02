import test from 'node:test';
import assert from 'node:assert/strict';
import { decodePayload, encodePayload, normalizeShift, normalizeTime, parseTimeRange, dedupeShifts, dominantMonth, onlyMonth, totals, parseText, reconcileMonth, safeReconcileMonth } from '../src/core.mjs';

const september = [
['2026-09-02','01:00','08:00'],['2026-09-03','01:00','04:00'],['2026-09-04','01:00','04:00'],['2026-09-06','11:00','13:00'],
['2026-09-08','22:00','00:00'],['2026-09-09','22:00','00:00'],['2026-09-10','22:00','00:00'],['2026-09-11','01:00','04:00'],
['2026-09-12','01:00','04:00'],['2026-09-13','21:00','00:00'],['2026-09-16','01:00','04:00'],['2026-09-17','01:00','04:00'],
['2026-09-19','01:00','04:00'],['2026-09-20','00:00','03:00'],['2026-09-21','01:00','04:00'],['2026-09-29','01:00','03:00'],
['2026-09-29','22:00','00:00'],['2026-09-30','22:00','00:00']
].map(([date,start,end])=>({date,start,end}));

test('parses full, truncated and unicode-ellipsis Knok time ranges', () => {
  assert.deepEqual(parseTimeRange('01:00 - 04:00'), ['01:00','04:00']);
  assert.deepEqual(parseTimeRange('01:00 - 04...'), ['01:00','04:00']);
  assert.deepEqual(parseTimeRange('01:00 – 04…'), ['01:00','04:00']);
  assert.deepEqual(parseTimeRange('01:00 - 4'), ['01:00','04:00']);
});

test('normalizes valid time forms and rejects invalid values', () => {
  assert.equal(normalizeTime('4'), '04:00');
  assert.equal(normalizeTime('04...'), '04:00');
  assert.equal(normalizeTime('24:00'), null);
  assert.equal(normalizeShift({date:'2026-09-01',start:'04:00',end:'04:00'}), null);
});

test('reference September roster has deterministic totals', () => {
  const t = totals(september, 12);
  assert.equal(september.length, 18);
  assert.equal(t.total, 51);
  assert.equal(t.night, 35);
  assert.equal(t.day, 16);
  assert.equal(t.pay, 647);
});

test('overnight split only treats 00:00–07:00 as night', () => {
  const t=totals([{date:'2026-09-01',start:'22:00',end:'08:00'}],12);
  assert.equal(t.total,10);
  assert.equal(t.night,7);
  assert.equal(t.day,3);
  assert.equal(t.pay,127);
});

test('dedupe and month filtering are idempotent', () => {
  const mixed = [...september, september[0], {date:'2026-08-31',start:'00:00',end:'07:00'}];
  assert.equal(dedupeShifts(mixed).length, 19);
  assert.equal(dominantMonth(mixed), '2026-09');
  assert.equal(onlyMonth(mixed,'2026-09').length, 18);
});

test('text import accepts pt-PT CSV and compact ranges', () => {
  const parsed = parseText('02/09/2026;01:00;08:00\n03/09/2026 01:00 - 04...', '2026-09');
  assert.deepEqual(parsed, september.slice(0,2));
});

test('reconcile reports changes without duplicates', () => {
  const incoming = [...september.slice(1), {date:'2026-09-05',start:'08:00',end:'10:00'}];
  const diff = reconcileMonth(september, incoming, '2026-09');
  assert.equal(diff.added.length,1);
  assert.equal(diff.removed.length,1);
  assert.equal(diff.unchanged.length,17);
  assert.equal(diff.shifts.length,18);
});

test('safe reconcile preserves existing shifts on an incomplete read', () => {
  const incomplete=september.slice(0,10);
  const diff=safeReconcileMonth(september,incomplete,'2026-09',{healthy:false});
  assert.equal(diff.mode,'merge-safe');
  assert.equal(diff.shifts.length,18);
  assert.equal(diff.removed.length,8);
});

test('healthy reconcile can propose removals for explicit review', () => {
  const completeChange=september.slice(0,17);
  const diff=safeReconcileMonth(september,completeChange,'2026-09',{healthy:true});
  assert.equal(diff.mode,'replace');
  assert.equal(diff.requiresReview,true);
  assert.equal(diff.removed.length,1);
});

test('payload v3 round-trips diagnostics and shifts', () => {
  const diagnostics={month:'2026-09',title:'Setembro 2026',cellCount:30,eventNodeCount:18,parsedEventNodeCount:18,unparsedEventNodeCount:0,healthy:true};
  const encoded=encodePayload(september,'test',diagnostics),decoded=decodePayload(encoded);
  assert.equal(decoded.v,3);
  assert.equal(decoded.shifts.length,18);
  assert.equal(decoded.diagnostics.healthy,true);
  assert.equal(decoded.diagnostics.eventNodeCount,18);
});
