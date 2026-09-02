import test from 'node:test';
import assert from 'node:assert/strict';
await import('../extension/shared.js');
const K=globalThis.KnokShared;
test('extension shared parser matches Knok time formats',()=>{
  assert.deepEqual(K.timePair('01:00 - 04...'),['01:00','04:00']);
  assert.deepEqual(K.timePair('22:00 – 00:00'),['22:00','00:00']);
  assert.equal(K.timePair('04:00 - 04:00'),null);
});
test('extension fallback can parse multiple events in one day cell',()=>{
  assert.deepEqual(K.allTimePairs('01:00 - 03:00 22:00 - 00:00'),[['01:00','03:00'],['22:00','00:00']]);
});
test('extension dominant month prefers actual event majority',()=>{
  assert.equal(K.dominantMonth([{date:'2026-08-31'},{date:'2026-09-01'},{date:'2026-09-02'}]),'2026-09');
});
