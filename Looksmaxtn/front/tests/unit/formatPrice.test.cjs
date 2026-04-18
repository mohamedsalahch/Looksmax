const test = require("node:test");
const assert = require("node:assert/strict");
const jiti = require("jiti")(__filename);

const { formatTndPrice } = jiti("../../src/lib/formatPrice.ts");

test("formatTndPrice formats numeric values", () => {
  assert.equal(formatTndPrice(12), "12.00 TND");
});

test("formatTndPrice formats string values", () => {
  assert.equal(formatTndPrice("12.3"), "12.30 TND");
});

test("formatTndPrice falls back to zero for invalid input", () => {
  assert.equal(formatTndPrice("not-a-number"), "0.00 TND");
});

