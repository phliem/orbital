import assert from "node:assert/strict";
import test from "node:test";
import { errorNoticeCopy } from "../src/lib/api-key-error.ts";

const message =
	"No LLM API key configured. Set ANTHROPIC_API_KEY/OPENAI_API_KEY in .env";

test("a missing API key is shown as its own error", () => {
	assert.deepEqual(errorNoticeCopy(message, "The report could not be generated."), {
		title: "No LLM API key configured.",
		body: "Set ANTHROPIC_API_KEY/OPENAI_API_KEY in .env",
	});
});

test("other failures keep their own title", () => {
	assert.deepEqual(
		errorNoticeCopy("The model request failed.", "The report could not be generated."),
		{
			title: "The report could not be generated.",
			body: "The model request failed.",
		},
	);
});
