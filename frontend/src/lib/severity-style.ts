import type { Severity } from "../types";

/**
 * One accent per severity. The finding card's top bar and the filter swatch
 * both use these classes, so the swatch is the same colour as the bar.
 */
export const severityAccent: Record<Severity, string> = {
	issue: "bg-high",
	needs_evidence: "bg-evidence",
	low_priority: "bg-low",
	not_found: "bg-muted-foreground/40",
};
