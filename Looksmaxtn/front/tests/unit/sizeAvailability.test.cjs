const test = require("node:test");
const assert = require("node:assert/strict");
const jiti = require("jiti")(__filename);

const { buildSizeAvailability, getDefaultSelectableSize, getSelectedSizeStock } = jiti("../../src/lib/sizeAvailability.ts");

test("buildSizeAvailability subtracts other users' holds from size stock", () => {
  const availability = buildSizeAvailability(
    new Map([
      ["M", { stock: 3 }],
      ["L", { stock: 2 }],
    ]),
    [
      { reservationKey: "user:a", size: "M", quantity: 1 },
      { reservationKey: "user:b", size: "M", quantity: 1 },
      { reservationKey: "user:a", size: "L", quantity: 1 },
    ],
    "user:a"
  );

  assert.equal(availability.M.stock, 3);
  assert.equal(availability.M.available, true);
  assert.equal(availability.M.reservedElsewhere, false);
  assert.equal(availability.L.stock, 2);
  assert.equal(availability.L.reservedElsewhere, false);
});

test("buildSizeAvailability flags reserved elsewhere only when the full size stock is held", () => {
  const availability = buildSizeAvailability(
    new Map([
      ["44", { stock: 2 }],
    ]),
    [
      { reservationKey: "user:b", size: "44", quantity: 2 },
    ],
    "user:a"
  );

  assert.equal(availability["44"].stock, 2);
  assert.equal(availability["44"].reservedElsewhere, true);
});

test("buildSizeAvailability does not mark zero stock as reserved elsewhere", () => {
  const availability = buildSizeAvailability(
    new Map([
      ["44", { stock: 0 }],
    ]),
    [
      { reservationKey: "user:b", size: "44", quantity: 1 },
    ],
    "user:a"
  );

  assert.equal(availability["44"].stock, 0);
  assert.equal(availability["44"].reservedElsewhere, false);
});

test("getDefaultSelectableSize skips depleted sizes", () => {
  const availability = {
    M: { stock: 0, available: false, reservedElsewhere: true },
    L: { stock: 2, available: true, reservedElsewhere: false },
  };

  assert.equal(getDefaultSelectableSize(["M", "L"], availability), "L");
});

test("getSelectedSizeStock returns the selected size stock", () => {
  const availability = {
    M: { stock: 2, available: true, reservedElsewhere: false },
  };

  assert.equal(getSelectedSizeStock(availability, "M", 99), 2);
});
