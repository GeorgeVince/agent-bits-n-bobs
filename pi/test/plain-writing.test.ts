import assert from "node:assert/strict";
import test from "node:test";
import plainWritingExtension from "../extensions/plain-writing.ts";

test("plain writing defaults off and can be toggled on", async () => {
  const commands = new Map<string, any>();
  const events = new Map<string, any>();
  const entries: any[] = [];
  const pi: any = {
    appendEntry: (customType: string, data: unknown) => entries.push({ customType, data }),
    on: (name: string, handler: unknown) => events.set(name, handler),
    registerCommand: (name: string, command: unknown) => commands.set(name, command),
    sendUserMessage() {},
  };
  const ctx: any = {
    sessionManager: { getBranch: () => [] },
    ui: { notify() {} },
  };

  plainWritingExtension(pi);
  await events.get("session_start")({}, ctx);
  assert.equal(await events.get("before_agent_start")({ systemPrompt: "BASE" }), undefined);

  await commands.get("plain-writing").handler("on", ctx);
  const result = await events.get("before_agent_start")({ systemPrompt: "BASE" });
  assert.match(result.systemPrompt, /PLAIN WRITING MODE ACTIVE/);
  assert.deepEqual(entries.at(-1), {
    customType: "plain-writing-mode",
    data: { enabled: true },
  });
});
