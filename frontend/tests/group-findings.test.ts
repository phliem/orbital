import assert from "node:assert/strict";
import { test } from "node:test";
import { groupFindings } from "../src/lib/report-view.ts";
import type { ChecklistItem } from "../src/types.ts";

function item(id: string, title: string, short: string, parent = ""): ChecklistItem {
	return {
		check_id: id,
		parent_id: parent,
		title,
		short_title: short,
		clause: "",
		status: "found",
		document_says: short,
		citation: { page: 1, clause: null, excerpt: short, verified: true },
		assessments: {},
	};
}

test("several cards for one instruction stay in one group", () => {
	const groups = groupFindings([
		item("custom:find_pollution_incidents", "find pollution incidents", "2014 diesel spill", "custom:find_pollution_incidents"),
		item("custom:find_pollution_incidents:2", "find pollution incidents", "2018 solvent", "custom:find_pollution_incidents"),
		item("custom:find_pollution_incidents:3", "find pollution incidents", "2021 stained soil", "custom:find_pollution_incidents"),
		item("custom:tanks", "find tanks", "North tank", "custom:tanks"),
	]);
	assert.equal(groups.length, 2);
	assert.equal(groups[0]?.label, "find pollution incidents");
	assert.equal(groups[0]?.items.length, 3);
	assert.equal(groups[1]?.items.length, 1);
});

test("an older finding with no parent is its own card", () => {
	const groups = groupFindings([
		item("height_restriction", "Height restriction", "Height restriction"),
	]);
	assert.equal(groups.length, 1);
	assert.equal(groups[0]?.items.length, 1);
});
