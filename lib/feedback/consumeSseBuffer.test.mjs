import assert from "node:assert/strict";
import test from "node:test";
import { consumeSseBuffer } from "./consumeSseBuffer.ts";

test("keeps incomplete SSE events for the next chunk", () => {
  const parsed = consumeSseBuffer('data: {"message":"收到"}\n\ndata: {"message":"等待');

  assert.deepEqual(parsed.messages, ["收到"]);
  assert.equal(parsed.rest, 'data: {"message":"等待');
});
