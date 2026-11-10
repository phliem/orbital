import assert from "node:assert/strict";
import { test } from "node:test";
import {
	defaultSection,
	projectSections,
} from "../src/lib/project-sections.ts";

test("project navigation is Analysis, Chat, Documents, then Manage project", () => {
	assert.deepEqual(
		projectSections.map((item) => item.id),
		["analysis", "chat", "documents", "manage"],
	);
	assert.deepEqual(
		projectSections.map((item) => item.label),
		["Analysis", "Chat", "Documents", "Manage project"],
	);
	assert.equal(defaultSection, "analysis");
	assert.equal(projectSections[0].id, defaultSection);
});
