import { test } from "node:test";
import assert from "node:assert/strict";

import { buildHeaders, buildWsUrl } from "../src/client.ts";

test("no token is json only", () => {
  assert.deepEqual(buildHeaders(undefined), { "content-type": "application/json" });
});

test("a token becomes a bearer header", () => {
  assert.equal(buildHeaders("secret")["authorization"], "Bearer secret");
});

test("http becomes ws with the stream path", () => {
  assert.equal(buildWsUrl("http://127.0.0.1:4000", undefined), "ws://127.0.0.1:4000/stream");
});

test("https becomes wss", () => {
  assert.ok(buildWsUrl("https://box:4000", undefined).startsWith("wss://box:4000/stream"));
});

test("a token rides the query string (a WS upgrade can't carry a header)", () => {
  assert.equal(buildWsUrl("http://h:1", "t"), "ws://h:1/stream?token=t");
});

test("a trailing slash on the server is not doubled", () => {
  assert.equal(buildWsUrl("http://h:1/", undefined), "ws://h:1/stream");
});
