import assert from "node:assert/strict";
import { test } from "node:test";
import { groupTitles, setupGroups } from "../src/lib/clients.ts";
import {
	analysedCountLabel,
	reviewCheckRows,
	rowsForReport,
	sentTitlesForReport,
} from "../src/lib/review-checks.ts";

const groups = setupGroups.northstar;
const titles = groupTitles(groups);
const sent = titles.filter((title) => title !== "Building limits");

test("the review dialog has no checkboxes and marks an unticked category not analysed", () => {
	const rows = reviewCheckRows(groups, sent);
	assert.equal(rows.length, 5);
	assert.equal(
		rows.every((row) => row.role === null),
		true,
	);
	const limits = rows.find((row) => row.title === "Building limits");
	const use = rows.find(
		(row) => row.title === "Permitted use and use restrictions",
	);
	assert.equal(limits?.analysed, false);
	assert.equal(limits?.status, "Not analysed");
	assert.equal(use?.analysed, true);
	assert.equal(analysedCountLabel(rows), "4 of 5 analysed");
});

test("coverage follows the checks sent with the report", () => {
	const report = {
		items: [{ title: "Permitted use and use restrictions" }],
		requested_checks: sent.map((title) => ({ title })),
	};
	const sentTitles = sentTitlesForReport(groups, titles, report);
	const rows = reviewCheckRows(groups, sentTitles);
	assert.equal(
		rows.find((row) => row.title === "Building limits")?.status,
		"Not analysed",
	);
	assert.equal(analysedCountLabel(rows), "4 of 5 analysed");
});

test("a lease report lists the custom check that was sent", () => {
	const rows = rowsForReport(groups, [], {
		document_type: "commercial-lease",
		items: [{ title: "Repair obligations" }],
		requested_checks: [
			{ title: "Repair obligations", category: "Added by you" },
		],
	});
	assert.equal(rows.length, 1);
	assert.equal(rows[0]?.title, "Repair obligations");
	assert.equal(rows[0]?.category, "Added by you");
	assert.equal(rows[0]?.analysed, true);
	assert.equal(rows[0]?.role, null);
});

test("an older title report keeps the checks it stored", () => {
	const rows = rowsForReport(setupGroups.willowbank, titles, {
		document_type: "title-report",
		items: [
			{ title: "Height restriction" },
			{ title: "$4.2M deed of trust" },
		],
		requested_checks: [
			{ title: "Height restriction", category: "Critical, could kill the deal" },
			{ title: "$4.2M deed of trust", category: "Must clear at closing" },
		],
	});
	assert.deepEqual(
		rows.map((row) => row.title),
		["Height restriction", "$4.2M deed of trust"],
	);
	assert.equal(rows.every((row) => row.analysed), true);
	assert.equal(
		rows.some((row) => row.title === "Height and massing"),
		false,
	);
});
