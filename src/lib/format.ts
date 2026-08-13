/**
 * Display formatting shared by every block, so no two of them can disagree
 * about how a date or a count is printed.
 */
import type { ChangeType } from "./release-index.ts";
import type { ReleaseType } from "./semver.ts";

/**
 * `2021-03-14`. ISO because this is a technical manual: it sorts, it never
 * means two different things in two countries, and every date in a column is
 * the same width, which matters once tabular figures are doing their job.
 */
export function formatDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/** The `datetime` attribute for a `<time>` element. */
export function isoDate(date: Date): string {
	return formatDate(date);
}

/** `1 change` / `5 changes`. */
export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
	return `${count} ${count === 1 ? singular : plural}`;
}

const RELEASE_TYPE_LABELS: Record<ReleaseType, string> = {
	major: "Major",
	minor: "Minor",
	patch: "Patch",
};

export function releaseTypeLabel(type: ReleaseType): string {
	return RELEASE_TYPE_LABELS[type];
}

const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
	added: "Added",
	fixed: "Fixed",
	changed: "Changed",
	removed: "Removed",
	deprecated: "Deprecated",
	"known-issue": "Known issues",
};

/** The small-caps section label a group of changes is printed under. */
export function changeTypeLabel(type: ChangeType): string {
	return CHANGE_TYPE_LABELS[type];
}

/** `/releases/31.0.0` and friends, in one place so no template guesses. */
export const routes = {
	home: () => "/",
	releases: () => "/releases",
	release: (version: string) => `/releases/${version}`,
	tags: () => "/tags",
	tag: (slug: string) => `/tags/${slug}`,
	changes: () => "/changes",
	changeType: (type: ChangeType) => `/changes/${type}`,
	knownIssues: () => "/known-issues",
	stats: () => "/stats",
} as const;
