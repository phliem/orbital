import assert from "node:assert/strict";
import test from "node:test";
import {
	countMatches,
	firstMatchPage,
	searchMarkRanges,
} from "../src/lib/highlight.ts";

const pages = [
	"ALTA Commitment for Title Insurance. File FC-2026-3317.",
	"No building may exceed three stories or 36 feet.",
	"A storm drainage easement crosses the pad.",
];

test("search counts matches and jumps to the first page", () => {
	assert.equal(countMatches(pages, "  "), 0);
	assert.equal(countMatches(pages, "title"), 1);
	assert.equal(countMatches(pages, "the"), 1);
	assert.equal(firstMatchPage(pages, "easement"), 3);
	assert.equal(firstMatchPage(pages, "missing"), null);
	assert.equal(firstMatchPage(pages, ""), null);
});

test("search highlights the matched letters and counts each occurrence", () => {
	const line = "Floors 8-10, 100 Bishopsgate, London EC2M 1GT";
	const header = "Commercial Lease — 100 Bishopsgate";
	const party = "BISHOPSGATE PROPERTY HOLDINGS LIMITED";
	const ranges = searchMarkRanges([header, line, party], "bishop");
	const slices = ranges.map((parts, index) =>
		parts.map((range) =>
			[header, line, party][index]?.slice(range.start, range.end),
		),
	);
	assert.deepEqual(slices, [["Bishop"], ["Bishop"], ["BISHOP"]]);
	for (const parts of ranges) {
		assert.equal(parts.length, 1);
		assert.ok((parts[0]?.end ?? 0) - (parts[0]?.start ?? 0) < line.length);
	}

	const repeated = "The bishop saw Bishopsgate and another bishop.";
	const hits = searchMarkRanges([repeated], "BiShOp")[0] ?? [];
	assert.deepEqual(
		hits.map((range) => repeated.slice(range.start, range.end)),
		["bishop", "Bishop", "bishop"],
	);
	assert.equal(countMatches([repeated], "bishop"), 3);
	assert.equal(countMatches([`${line} ${party}`], "bishop"), 2);
	assert.equal(firstMatchPage([header, "No match here", line], "bishop"), 1);

	const across = searchMarkRanges(
		["100 ", "Bishopsgate, London EC2M 1GT"],
		"100 bishop",
	);
	assert.deepEqual(
		across.map((parts, index) =>
			parts.map((range) =>
				["100 ", "Bishopsgate, London EC2M 1GT"][index]?.slice(
					range.start,
					range.end,
				),
			),
		),
		[["100 "], ["Bishop"]],
	);
});
