import assert from "node:assert/strict";
import { test } from "node:test";
import { addedChecksForRun, canRunReport } from "../src/lib/run-report.ts";

test("an empty lease checklist cannot run", () => {
	assert.equal(canRunReport(addedChecksForRun({}).length), false);
	assert.equal(
		canRunReport(addedChecksForRun({ "Repair obligations": false }).length),
		false,
	);
});

test("a selected custom check can run", () => {
	const checks = addedChecksForRun({ "Repair obligations": true });
	assert.deepEqual(checks, [
		{ title: "Repair obligations", category: "Added by you" },
	]);
	assert.equal(canRunReport(checks.length), true);
});
