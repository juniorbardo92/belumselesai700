import test from "node:test";
import assert from "node:assert/strict";

import {
  ACCOUNT_ID,
  BRAND_ID,
  NAMESPACE,
  SYSTEM_PROMPT,
  extractAiText,
  isAuthorized,
  normalizeCommand,
  parseAdminIds,
  runAi,
  splitTelegramMessage,
} from "../src/index.js";

test("identity and publishing guardrails are immutable", () => {
  assert.equal(NAMESPACE, "ruang-kalyanamitra");
  assert.equal(BRAND_ID, "brand-ruang-kalyanamitra");
  assert.equal(ACCOUNT_ID, "kalyanamitra");
  assert.match(SYSTEM_PROMPT, /automaticPublish=false/);
  assert.match(SYSTEM_PROMPT, /publisherMode=draft-only/);
  assert.match(SYSTEM_PROMPT, /do-not-publish/);
  assert.match(SYSTEM_PROMPT, /Theravada, Mahayana, dan Vajrayana/);
});

test("admin list accepts only numeric Telegram IDs", () => {
  assert.deepEqual([...parseAdminIds("123, 456,abc,,789")], ["123", "456", "789"]);
  assert.equal(isAuthorized(456, "123,456"), true);
  assert.equal(isAuthorized(999, "123,456"), false);
});

test("commands are normalized and bot usernames removed", () => {
  assert.deepEqual(normalizeCommand("/draft@asistenkalyanamitrabot topik dana"), {
    command: "/draft",
    argument: "topik dana",
  });
  assert.deepEqual(normalizeCommand("Apa makna dana?"), {
    command: "",
    argument: "Apa makna dana?",
  });
});

test("long Telegram replies are split safely", () => {
  const value = `${"a".repeat(2_000)}\n\n${"b".repeat(2_000)}`;
  const chunks = splitTelegramMessage(value, 2_500);
  assert.equal(chunks.length, 2);
  assert.ok(chunks.every((chunk) => chunk.length <= 2_500));
  assert.equal(chunks.join("\n\n"), value);
});

test("AI response extraction handles supported shapes", () => {
  assert.equal(extractAiText({ response: " jawaban " }), "jawaban");
  assert.equal(extractAiText({ choices: [{ message: { content: "isi" } }] }), "isi");
  assert.equal(extractAiText({ choices: [{ text: "teks" }] }), "teks");
  assert.equal(extractAiText({ choices: [{ message: { content: null, reasoning: "internal" } }] }), "");
  assert.equal(extractAiText({}), "");
});

test("GLM thinking is disabled so the answer is returned as content", async () => {
  let captured;
  const env = {
    AI_MODEL: "@cf/zai-org/glm-4.7-flash",
    AI: {
      async run(_model, payload) {
        captured = payload;
        return { choices: [{ message: { content: "jawaban" } }] };
      },
    },
  };

  const result = await runAi(env, [], "tes", false);
  assert.equal(result.output, "jawaban");
  assert.deepEqual(captured.chat_template_kwargs, { enable_thinking: false });
});
