import assert from "node:assert/strict";
import test from "node:test";
import {
	allIsSelected,
	applyStatus,
	countMarked,
	countRisk,
	resolvedButtonState,
	selectAll,
	visibleFindings,
} from "../src/lib/report-view.ts";
import type { CheckId, ChecklistItem, Risk } from "../src/types.ts";

function item(
	id: CheckId,
	risk: Risk,
	status: ChecklistItem["status"] = "found",
): ChecklistItem {
	const missing = status === "not_found";
	return {
		check_id: id,
		title: id,
		short_title: id,
		clause: "Requirement 7",
		status,
		document_says: missing
			? "Not found in this document."
			: "The document says this.",
		citation: {
			page: missing ? null : 2,
			clause: "Requirement 7",
			excerpt: missing ? null : "quoted",
			verified: !missing,
		},
		assessments: {
			willowbank: {
				risk,
				summary: missing ? "Not found in this document." : "Summary",
				recommendation: "Advice",
				unresolved_note: null,
			},
			northstar: {
				risk,
				summary: missing ? "Not found in this document." : "Summary",
				recommendation: "Advice",
				unresolved_note: null,
			},
		},
	};
}

const items = [
	item("height_restriction", "issue"),
	item("drainage_easement", "issue"),
	item("monetary_lien", "needs_evidence"),
	item("shared_access", "low_priority"),
	item("open_demolition_permit", "needs_evidence", "not_found"),
];

test("All shows every finding, including resolved, and clears both filters", () => {
	const cleared = selectAll();
	assert.deepEqual(cleared, { filter: [], status: null });
	assert.equal(allIsSelected(["issue"], "resolved"), false);
	assert.equal(allIsSelected(cleared.filter, cleared.status), true);
	const visible = visibleFindings(
		items,
		"willowbank",
		cleared.filter,
		["height_restriction"],
		["drainage_easement"],
		cleared.status,
	);
	assert.deepEqual(
		visible.map((entry) => entry.check_id),
		items.map((entry) => entry.check_id),
	);
});

test("the resolved control stays labeled Resolved and reports pressed when on", () => {
	assert.deepEqual(resolvedButtonState(true), {
		pressed: true,
		filled: true,
		label: "Resolved",
	});
	assert.equal(resolvedButtonState(true).pressed, true);
	assert.deepEqual(resolvedButtonState(false), {
		pressed: false,
		filled: false,
		label: "Resolved",
	});
});

test("flagged and resolved are independent and single-choice", () => {
	const followUps = ["height_restriction", "drainage_easement"];
	const resolved = ["drainage_easement", "monetary_lien"];
	assert.deepEqual(
		applyStatus(items, followUps, resolved, "flagged").map(
			(entry) => entry.check_id,
		),
		["height_restriction", "drainage_easement"],
	);
	assert.deepEqual(
		applyStatus(items, followUps, resolved, "resolved").map(
			(entry) => entry.check_id,
		),
		["drainage_easement", "monetary_lien"],
	);
	assert.deepEqual(
		visibleFindings(
			items,
			"willowbank",
			["issue"],
			followUps,
			resolved,
			"flagged",
		).map((entry) => entry.check_id),
		["height_restriction", "drainage_easement"],
	);
});

test("each chip count is the set that chip would show", () => {
	const followUps = ["height_restriction"];
	const resolved = ["drainage_easement", "open_demolition_permit"];
	assert.equal(items.length, 5);
	assert.equal(countRisk(items, "willowbank", "issue"), 2);
	assert.equal(countRisk(items, "willowbank", "needs_evidence"), 1);
	assert.equal(countRisk(items, "willowbank", "low_priority"), 1);
	assert.equal(countRisk(items, "willowbank", "not_found"), 1);
	assert.equal(countMarked(items, followUps), 1);
	assert.equal(countMarked(items, resolved), 2);
	assert.equal(
		applyStatus(items, followUps, resolved, "flagged").length,
		countMarked(items, followUps),
	);
	assert.equal(
		applyStatus(items, followUps, resolved, "resolved").length,
		countMarked(items, resolved),
	);
});

test("not found is its own filter and does not count as needs evidence", () => {
	const visible = visibleFindings(items, "willowbank", ["not_found"]);
	assert.deepEqual(
		visible.map((entry) => entry.check_id),
		["open_demolition_permit"],
	);
	assert.equal(countRisk(items, "willowbank", "not_found"), 1);
	assert.equal(countRisk(items, "willowbank", "needs_evidence"), 1);
});
