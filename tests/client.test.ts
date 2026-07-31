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

/*
 * Everything above hands buildWsUrl a well-formed URL, which is exactly how the
 * bug survived: there was no `else`, so an address without a scheme fell through
 * untouched and produced "localhost:4000/stream". `new WebSocket` rejects that
 * by THROWING, and the throw travelled out of connectStream, out of
 * service.start(), and off the top level of plugin.ts — taking the machine
 * meters down with the cockpit over a mistyped setting.
 */
test("an address with no scheme gets one rather than a throw downstream", () => {
  assert.equal(buildWsUrl("localhost:4000", undefined), "ws://localhost:4000/stream");
  assert.equal(buildWsUrl("127.0.0.1:4000", undefined), "ws://127.0.0.1:4000/stream");
  assert.equal(buildWsUrl("192.168.1.9:4000", "t"), "ws://192.168.1.9:4000/stream?token=t");
});

test("surrounding whitespace does not become part of the host", () => {
  assert.equal(buildWsUrl("  http://h:1  ", undefined), "ws://h:1/stream");
});

test("an address that already speaks ws is left alone", () => {
  assert.equal(buildWsUrl("ws://h:1", undefined), "ws://h:1/stream");
  assert.equal(buildWsUrl("wss://h:1", undefined), "wss://h:1/stream");
});

/*
 * The URLs above all have to survive the real constructor, not just look right.
 * Asserting the string alone is what the original tests did, and it is why a
 * value that parses as text but throws as a URL went unnoticed.
 */
test("every produced URL is one the real WebSocket constructor accepts", () => {
  for (const server of ["localhost:4000", "127.0.0.1:4000", "http://h:1", "https://box:4000", "ws://h:1"]) {
    const url = buildWsUrl(server, "tok");
    assert.doesNotThrow(() => new URL(url), `${server} -> ${url}`);
    assert.match(url, /^wss?:\/\//, `${server} -> ${url}`);
  }
});
