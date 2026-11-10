function normalizeWithMap(input: string): { text: string; map: number[] } {
	const map: number[] = [];
	let text = "";
	let pendingSpace = false;
	const push = (ch: string, index: number) => {
		text += ch;
		map.push(index);
	};
	for (let i = 0; i < input.length; i++) {
		let ch = input[i] ?? "";
		if (ch === "\u2018" || ch === "\u2019") ch = "'";
		else if (ch === "\u201c" || ch === "\u201d") ch = '"';
		else if (ch === "\u2013" || ch === "\u2014") ch = "-";
		else if (ch === "\u00a0") ch = " ";
		if (/\s/.test(ch)) {
			pendingSpace = text.length > 0;
			continue;
		}
		if (pendingSpace) {
			push(" ", i);
			pendingSpace = false;
		}
		push(ch.toLowerCase(), i);
	}
	return { text, map };
}

export function pageTextFromItems(items: readonly { str?: string }[]): string {
	let full = "";
	for (const item of items) {
		const raw = item.str ?? "";
		if (!raw) continue;
		if (full.length > 0 && !full.endsWith(" ")) full += " ";
		full += raw;
	}
	return full;
}

/** Non-overlapping matches of `query` across page strings. */
export function countMatches(pages: readonly string[], query: string): number {
	const needle = normalizeWithMap(query).text;
	if (!needle) return 0;
	let count = 0;
	for (const page of pages) {
		const text = normalizeWithMap(page).text;
		let from = 0;
		while (from <= text.length - needle.length) {
			const at = text.indexOf(needle, from);
			if (at < 0) break;
			count += 1;
			from = at + needle.length;
		}
	}
	return count;
}

/** 1-based page number of the first match, or null. */
export function firstMatchPage(
	pages: readonly string[],
	query: string,
): number | null {
	const needle = normalizeWithMap(query).text;
	if (!needle) return null;
	for (let index = 0; index < pages.length; index++) {
		if (normalizeWithMap(pages[index] ?? "").text.includes(needle)) {
			return index + 1;
		}
	}
	return null;
}

/** Mark the PDF text-layer spans that contain the verified excerpt. */
export function markExcerpt(root: HTMLElement, excerpt: string): void {
	for (const node of root.querySelectorAll("span.clause-mark")) {
		node.classList.remove("clause-mark", "evidence-flash");
	}
	const spans = Array.from(
		root.querySelectorAll<HTMLElement>(
			".react-pdf__Page__textContent span, .textLayer span",
		),
	);
	if (spans.length === 0 || !excerpt.trim()) return;

	let full = "";
	const entries: { start: number; end: number; el: HTMLElement }[] = [];
	for (const el of spans) {
		const raw = el.textContent ?? "";
		if (!raw) continue;
		if (full.length > 0 && !full.endsWith(" ")) full += " ";
		const start = full.length;
		full += raw;
		entries.push({ start, end: full.length, el });
	}

	const { text, map } = normalizeWithMap(full);
	const needle = normalizeWithMap(excerpt).text;
	const at = needle ? text.indexOf(needle) : -1;
	if (at < 0) return;
	const origStart = map[at];
	const origEnd = map[at + needle.length - 1];
	if (origStart === undefined || origEnd === undefined) return;

	let first: HTMLElement | null = null;
	for (const entry of entries) {
		if (entry.end > origStart && entry.start <= origEnd) {
			entry.el.classList.add("clause-mark", "evidence-flash");
			if (!first) first = entry.el;
		}
	}
	first?.scrollIntoView({ block: "center", behavior: "smooth" });
}

export interface TextRange {
	/** Start offset in the span, inclusive. */
	start: number;
	/** End offset in the span, exclusive. */
	end: number;
}

const TEXT_SPANS = ".react-pdf__Page__textContent span, .textLayer span";

/**
 * Character ranges to highlight for `query` inside each span.
 * A match that crosses two spans highlights only the overlapping characters
 * in each one. The join matches `pageTextFromItems`, so the ranges agree
 * with `countMatches`.
 */
export function searchMarkRanges(
	spans: readonly string[],
	query: string,
): TextRange[][] {
	const ranges = spans.map(() => [] as TextRange[]);
	const needle = normalizeWithMap(query).text;
	if (!needle) return ranges;

	let full = "";
	const entries: { start: number; end: number; index: number }[] = [];
	for (let index = 0; index < spans.length; index++) {
		const raw = spans[index] ?? "";
		if (!raw) continue;
		if (full.length > 0 && !full.endsWith(" ")) full += " ";
		const start = full.length;
		full += raw;
		entries.push({ start, end: full.length, index });
	}

	const { text, map } = normalizeWithMap(full);
	let from = 0;
	while (from <= text.length - needle.length) {
		const at = text.indexOf(needle, from);
		if (at < 0) break;
		const origStart = map[at];
		const origEnd = map[at + needle.length - 1];
		if (origStart !== undefined && origEnd !== undefined) {
			for (const entry of entries) {
				const start = Math.max(entry.start, origStart);
				const end = Math.min(entry.end - 1, origEnd);
				if (start <= end) {
					ranges[entry.index]?.push({
						start: start - entry.start,
						end: end - entry.start + 1,
					});
				}
			}
		}
		from = at + needle.length;
	}
	return ranges.map(mergeRanges);
}

function mergeRanges(ranges: TextRange[]): TextRange[] {
	const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
	const merged: TextRange[] = [];
	for (const range of sorted) {
		const last = merged[merged.length - 1];
		if (last && range.start <= last.end) {
			last.end = Math.max(last.end, range.end);
		} else {
			merged.push({ ...range });
		}
	}
	return merged;
}

function restoreSearch(spans: HTMLElement[]) {
	for (const el of spans) {
		const original = el.dataset.searchText;
		if (original !== undefined) {
			el.textContent = original;
			delete el.dataset.searchText;
		}
		el.classList.remove("search-mark", "search-hit");
	}
}

/** Wrap each matched substring in a mark. Citation marks stay on the whole span. */
export function markQuery(
	root: HTMLElement,
	query: string,
	scroll: boolean,
): void {
	const spans = Array.from(root.querySelectorAll<HTMLElement>(TEXT_SPANS));
	restoreSearch(spans);
	const needle = normalizeWithMap(query).text;
	if (!needle || spans.length === 0) return;

	const texts = spans.map((el) => el.textContent ?? "");
	const ranges = searchMarkRanges(texts, query);
	let first: HTMLElement | null = null;
	for (let index = 0; index < spans.length; index++) {
		const el = spans[index];
		const parts = ranges[index] ?? [];
		const raw = texts[index] ?? "";
		if (!el || parts.length === 0 || !raw) continue;
		el.dataset.searchText = raw;
		el.classList.add("search-hit");
		const fragment = document.createDocumentFragment();
		let cursor = 0;
		for (const range of parts) {
			const start = Math.max(0, Math.min(raw.length, range.start));
			const end = Math.max(start, Math.min(raw.length, range.end));
			if (start > cursor) {
				fragment.append(document.createTextNode(raw.slice(cursor, start)));
			}
			if (end > start) {
				const mark = document.createElement("mark");
				mark.className = "search-mark";
				mark.textContent = raw.slice(start, end);
				fragment.append(mark);
				if (!first) first = mark;
			}
			cursor = end;
		}
		if (cursor < raw.length) {
			fragment.append(document.createTextNode(raw.slice(cursor)));
		}
		el.replaceChildren(fragment);
	}
	if (scroll && first)
		first.scrollIntoView({ block: "center", behavior: "smooth" });
}
