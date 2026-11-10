import assert from "node:assert/strict";
import { test } from "node:test";
import {
	PROJECT_TITLE_MAX,
	nextProjectTitle,
} from "../src/lib/project-title.ts";

test("a project title saves only when it changes", () => {
	assert.equal(PROJECT_TITLE_MAX, 120);
	assert.equal(nextProjectTitle("Fairmont", "Fairmont"), null);
	assert.equal(nextProjectTitle("Fairmont", "  Fairmont  "), null);
	assert.equal(nextProjectTitle("Fairmont", "   "), null);
	assert.equal(nextProjectTitle("Fairmont", "Fairmont homes"), "Fairmont homes");
	assert.equal(
		nextProjectTitle("Fairmont", `  ${"x".repeat(PROJECT_TITLE_MAX)}  `),
		"x".repeat(PROJECT_TITLE_MAX),
	);
	assert.equal(nextProjectTitle("Fairmont", "x".repeat(121)), null);
});
