import test from "node:test";
import assert from "node:assert/strict";
import {
  formatLocalDateTime,
  getLocalDateString,
  getUtcRangeForLocalDate,
} from "@/lib/time";

test("getLocalDateString uses the requested timezone", () => {
  const date = new Date("2026-03-24T18:30:00.000Z");
  assert.equal(getLocalDateString(date, "Asia/Manila"), "2026-03-25");
});

test("getUtcRangeForLocalDate returns an ordered range", () => {
  const range = getUtcRangeForLocalDate("2026-03-25", "Asia/Manila");
  assert.ok(range.startIso < range.endIso);
});

test("formatLocalDateTime formats the local meeting time", () => {
  const label = formatLocalDateTime("2026-03-25T01:00:00.000Z", "Asia/Manila");
  assert.match(label, /9:00/);
});
