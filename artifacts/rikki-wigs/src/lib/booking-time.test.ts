import assert from 'node:assert/strict';
import test from 'node:test';
import { isAvailableTime, toDisplayTime, toInputTime } from './booking-time';

test('converts arbitrary appointment minutes in both directions', () => {
  assert.equal(toDisplayTime('09:07'), '9:07 AM');
  assert.equal(toDisplayTime('15:43'), '3:43 PM');
  assert.equal(toInputTime('12:00 AM'), '00:00');
  assert.equal(toInputTime('3:43 PM'), '15:43');
});

test('validates exact starts against inclusive available ranges', () => {
  const day = {
    date: '2026-09-25',
    times: ['9:07 AM'],
    availableStartRanges: [{ start: '09:07', end: '09:13' }],
  };
  assert.equal(isAvailableTime(day, '9:12 AM'), true);
  assert.equal(isAvailableTime(day, '9:14 AM'), false);
});