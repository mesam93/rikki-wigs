import assert from 'node:assert/strict';
import test from 'node:test';
import { appointmentTimeMinutes, findNextConfirmedAppointment } from './schedule-time.ts';

const day = '2026-09-23';
const appointment = (time: string, date = day, status = 'confirmed') => ({
  status,
  appointmentDate: date,
  appointmentTime: time,
});

test('parses 12-hour and 24-hour times across noon and midnight', () => {
  assert.equal(appointmentTimeMinutes('9:00 AM'), 540);
  assert.equal(appointmentTimeMinutes('10:00 AM'), 600);
  assert.equal(appointmentTimeMinutes('12:00 PM'), 720);
  assert.equal(appointmentTimeMinutes('2:00 PM'), 840);
  assert.equal(appointmentTimeMinutes('12:00 AM'), 0);
  assert.equal(appointmentTimeMinutes('14:30'), 870);
  assert.equal(appointmentTimeMinutes('13:00 PM'), null);
  assert.equal(appointmentTimeMinutes('n/a'), null);
});

test('selects the earliest future appointment, not the lexicographically first time', () => {
  const items = [appointment('2:00 PM'), appointment('9:00 AM'), appointment('12:00 PM'), appointment('10:00 AM')];
  assert.equal(findNextConfirmedAppointment(items, new Date(2026, 8, 23, 8, 0)).appointment?.appointmentTime, '9:00 AM');
  assert.equal(findNextConfirmedAppointment(items, new Date(2026, 8, 23, 9, 1)).appointment?.appointmentTime, '10:00 AM');
  assert.equal(findNextConfirmedAppointment(items, new Date(2026, 8, 23, 10, 1)).appointment?.appointmentTime, '12:00 PM');
  assert.equal(findNextConfirmedAppointment(items, new Date(2026, 8, 23, 12, 1)).appointment?.appointmentTime, '2:00 PM');
});

test('excludes elapsed and non-confirmed requests and advances to the next day', () => {
  const items = [appointment('9:00 AM'), appointment('3:00 PM', day, 'pending'), appointment('8:00 AM', '2026-09-24')];
  assert.equal(findNextConfirmedAppointment(items, new Date(2026, 8, 23, 10, 0)).appointment?.appointmentDate, '2026-09-24');
  assert.equal(findNextConfirmedAppointment(items, new Date(2026, 8, 24, 8, 1)).appointment, undefined);
});

test('reports invalid upcoming times instead of silently treating them as a valid next appointment', () => {
  const result = findNextConfirmedAppointment([appointment('unknown'), appointment('2:00 PM')], new Date(2026, 8, 23, 10, 0));
  assert.equal(result.appointment?.appointmentTime, '2:00 PM');
  assert.equal(result.hasInvalidTimes, true);
});