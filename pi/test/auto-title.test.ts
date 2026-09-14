import assert from "node:assert/strict";
import test from "node:test";
import autoTitle, { cleanTitle } from "../extensions/auto-title.ts";

test("names an unnamed session once with the title model", async () => {
  const events = new Map<string, any>();
  const names: string[] = [];
  let completions = 0;
  const model = { provider: "openai-codex", id: "gpt-5.6-luna" };
  const pi: any = {
    getSessionName: () => names.at(-1),
    on: (name: string, handler: unknown) => events.set(name, handler),
    setSessionName: (name: string) => names.push(name),
  };
  const ctx: any = {
    sessionManager: { getBranch: () => [] },
    modelRegistry: {
      find: (provider: string, id: string) =>
        provider === model.provider && id === model.id ? model : undefined,
      hasConfiguredAuth: () => true,
      complete: async () => {
        completions += 1;
        return { content: [{ type: "text", text: '"Fix login redirect."\n' }] };
      },
    },
  };

  autoTitle(pi);
  await events.get("session_start")({}, ctx);
  await events.get("before_agent_start")({ prompt: "Login redirects are broken" }, ctx);
  await events.get("before_agent_start")({ prompt: "More detail" }, ctx);

  assert.equal(completions, 1);
  assert.deepEqual(names, ["Fix login redirect"]);
  assert.equal(cleanTitle("safe\x1b]0;hacked\x07"), "safe]0;hacked");
});

test("names an existing unnamed session when the extension loads", async () => {
  const events = new Map<string, any>();
  let name: string | undefined;
  const pi: any = {
    getSessionName: () => name,
    on: (event: string, handler: unknown) => events.set(event, handler),
    setSessionName: (value: string) => { name = value; },
  };
  const ctx: any = {
    sessionManager: {
      getBranch: () => [{ type: "message", message: { role: "user", content: "Investigate the missing footer title" } }],
    },
    modelRegistry: {
      find: () => ({ provider: "openai-codex", id: "gpt-5.6-luna" }),
      hasConfiguredAuth: () => true,
      complete: async () => ({ content: [{ type: "text", text: "Fix footer title" }] }),
    },
  };

  autoTitle(pi);
  await events.get("session_start")({}, ctx);

  assert.equal(name, "Fix footer title");
});
