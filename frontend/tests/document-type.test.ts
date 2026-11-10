import assert from "node:assert/strict";
import { test } from "node:test";
import {
	documentTypeLabel,
	documentTypes,
} from "../src/lib/document-type.ts";

test("an uploaded document stays a title report until a review stores another type", () => {
	assert.equal(documentTypeLabel({}), "Title report");
	assert.equal(
		documentTypeLabel({ document_type: "title-report" }),
		"Title report",
	);
	assert.equal(
		documentTypeLabel({ document_type: "commercial-lease" }),
		"Commercial Lease",
	);
	assert.equal(
		documentTypeLabel({ document_type: "environmental-assessments" }),
		"Environmental assessments",
	);
});

test("document types are Commercial Lease, Environmental assessments, then Title report", () => {
	assert.deepEqual(
		documentTypes.map((type) => type.label),
		["Commercial Lease", "Environmental assessments", "Title report"],
	);
	assert.deepEqual(
		documentTypes.map((type) => type.id),
		["commercial-lease", "environmental-assessments", "title-report"],
	);
});
