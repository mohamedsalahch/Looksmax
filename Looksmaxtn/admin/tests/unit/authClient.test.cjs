const test = require("node:test");
const assert = require("node:assert/strict");
const jiti = require("jiti")(__filename);

const {
  clearAuthToken,
  getStoredAuthToken,
  getTokenExpiryMs,
  storeAuthToken,
  withAuthHeaders,
} = jiti("../../src/lib/authClient.ts");

const originalWindow = global.window;

function mockWindow() {
  const storage = new Map();
  global.window = {
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => {
        storage.set(key, String(value));
      },
      removeItem: (key) => {
        storage.delete(key);
      },
    },
    atob: (value) => Buffer.from(value, "base64").toString("utf8"),
  };
}

test.beforeEach(() => {
  mockWindow();
});

test.afterEach(() => {
  global.window = originalWindow;
});

test("storeAuthToken and getStoredAuthToken round-trip the token", () => {
  storeAuthToken("token-123");
  assert.equal(getStoredAuthToken(), "token-123");
  clearAuthToken();
  assert.equal(getStoredAuthToken(), null);
});

test("withAuthHeaders appends a bearer token", () => {
  storeAuthToken("token-123");
  const headers = withAuthHeaders({ "X-Test": "1" });
  assert.equal(headers.get("Authorization"), "Bearer token-123");
  assert.equal(headers.get("X-Test"), "1");
});

test("getTokenExpiryMs decodes the expiry timestamp", () => {
  const payload = Buffer.from(JSON.stringify({ exp: 123456 }), "utf8").toString("base64url");
  const token = `header.${payload}.sig`;
  assert.equal(getTokenExpiryMs(token), 123456000);
});

test("getTokenExpiryMs returns null for invalid tokens", () => {
  assert.equal(getTokenExpiryMs("invalid"), null);
});

