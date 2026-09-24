import assert from "node:assert/strict";
import test from "node:test";
import { availableStarts } from "./availability-slots";

test("allows exact-minute starts and durations around appointments and blocked times", () => {
  const result = availableStarts(
    [{ start: "09:07", end: "10:40" }],
    17,
    [{ start: 9 * 60 + 30, end: 9 * 60 + 40 }],
    [{ start: 9 * 60 + 55, end: 10 * 60 }],
  );
  assert.deepEqual(result.availableStartRanges, [
    { start: "09:07", end: "09:13" },
    { start: "10:00", end: "10:23" },
  ]);
});

test("returns a date with only an off-grid minute available", () => {
  const result = availableStarts(
    [{ start: "10:01", end: "10:18" }],
    17, [], [],
  );
  assert.deepEqual(result.times, ["10:01 AM"]);
  assert.deepEqual(result.availableStartRanges, [{ start: "10:01", end: "10:01" }]);
});

test("excludes starts at or before the current minute", () => {
  const result = availableStarts([{ start: "14:00", end: "14:20" }], 5, [], [], 14 * 60 + 8);
  assert.deepEqual(result.availableStartRanges, [{ start: "14:08", end: "14:15" }]);
});