import assert from "node:assert/strict";
import { test } from "node:test";
import { displayedPropertyLine } from "../src/lib/property-line.ts";

const ADDRESS = "42-48 Victoria Park Road, London E9 7HD";

test("the property row uses the extracted address when the report missed it", () => {
	assert.equal(
		displayedPropertyLine("Not found in this document.", ADDRESS),
		ADDRESS,
	);
	assert.equal(displayedPropertyLine(null, ADDRESS), ADDRESS);
});

test("a richer report line is kept, and a rename is not the property", () => {
	const fuller = "733 Becker Station Road · APN 1973-08-4-12-008 · $6,850,000";
	assert.equal(displayedPropertyLine(fuller, "Fairmont homes"), fuller);
	assert.equal(
		displayedPropertyLine("Not found in this document.", null),
		"Not found in this document.",
	);
});
