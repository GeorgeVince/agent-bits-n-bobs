import assert from "node:assert/strict";
import test from "node:test";
import { formatQueryResult } from "../extensions/pgsql/index.ts";

test("pgsql limits returned rows", () => {
  const text = formatQueryResult({
    rows: Array.from({ length: 101 }, (_, id) => ({ id })),
    rowCount: 101,
    command: "SELECT",
  });

  assert.match(text, /"id": 99/);
  assert.doesNotMatch(text, /"id": 100/);
  assert.match(text, /Showing 100 of 101 rows/);
});
