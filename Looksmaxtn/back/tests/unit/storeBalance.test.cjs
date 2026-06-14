const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const mongoose = require("mongoose");
const jiti = require("jiti")(__filename, {
  alias: {
    "@": path.join(__dirname, "../../src"),
  },
});

const {
  calculateOrderEarningsByOwner,
} = jiti("../../src/admin/lib/storeBalance.ts");
const StoreBalanceTransaction = jiti("../../src/admin/models/StoreBalanceTransaction.ts").default;

test("calculateOrderEarningsByOwner groups net earnings per store owner", () => {
  const ownerA = new mongoose.Types.ObjectId().toString();
  const ownerB = new mongoose.Types.ObjectId().toString();
  const productA = new mongoose.Types.ObjectId();
  const productB = new mongoose.Types.ObjectId();
  const productOwnerMap = new Map([
    [productA.toString(), ownerA],
    [productB.toString(), ownerB],
  ]);

  const earnings = calculateOrderEarningsByOwner(
    [
      { product: productA, variant: null, name: "A", price: 100, size: "", color: "", quantity: 2 },
      { product: productB, variant: null, name: "B", price: 50, size: "", color: "", quantity: 1 },
      { product: productA, variant: null, name: "A2", price: 33.335, size: "", color: "", quantity: 1 },
    ],
    productOwnerMap
  );

  assert.equal(earnings.get(ownerA), 210);
  assert.equal(earnings.get(ownerB), 45);
});

test("StoreBalanceTransaction has a unique earning idempotency index per order and owner", () => {
  const indexes = StoreBalanceTransaction.schema.indexes();
  const idempotencyIndex = indexes.find(([fields, options]) => (
    fields.order === 1 &&
    fields.storeOwner === 1 &&
    fields.type === 1 &&
    options?.unique === true
  ));

  assert.ok(idempotencyIndex, "missing unique order/storeOwner/type index");
  assert.deepEqual(idempotencyIndex[1].partialFilterExpression, {
    order: { $type: "objectId" },
    type: "earning",
  });
});
