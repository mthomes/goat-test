/**
 * The derived view of the whole collection, computed once.
 *
 * This is the pure half of the query layer: it takes releases in and returns
 * everything every page needs, with no knowledge of Astro. `queries.ts` wraps
 * it with the `astro:content` read and the build-time memoisation.
 *
 * Keeping it pure is what makes the seam testable — the index can be built
 * from the real corpus in a unit test without a build step in between.
 */
import {
	buildKnownIssues,
	openKnownIssues,
	resolvedKnownIssues,
	type KnownIssue,
	type KnownIssueChange,
} from "./known-issues.ts";
import { compareVersions, deriveReleaseType, type ReleaseType } from "./semver.ts";

export const CHANGE_TYPES = [
	"added",
	"fixed",
	"changed",
	"removed",
	"deprecated",
	"known-issue",
] as const;

export type ChangeType = (typeof CHANGE_TYPES)[number];

/** Change types that describe work done, as opposed to work outstanding. */
export const RESOLVED_CHANGE_TYPES = CHANGE_TYPES.filter((type) => type !== "known-issue");

export interface Change {
	readonly type: ChangeType;
	readonly text: string;
	readonly tags: readonly string[];
	readonly id?: string;
	readonly resolves: readonly string[];
}

export interface RawRelease {
	readonly version: string;
	readonly released: Date;
	readonly summary?: string;
	readonly changes: readonly KnownIssueChange[];
}

export interface Release {
	readonly version: string;
	readonly released: Date;
	readonly summary?: string;
	readonly changes: readonly Change[];
	/** Derived, never authored. */
	readonly releaseType: ReleaseType;
	/** URL slug — the bare version. */
	readonly slug: string;
	/** The release before this one, older. */
	readonly previous?: string;
	/** The release after this one, newer. */
	readonly next?: string;
	/** Grouped for display, in a stable order, empty groups omitted. */
	readonly changesByType: readonly ChangeGroup[];
}

export interface ChangeGroup {
	readonly type: ChangeType;
	readonly changes: readonly Change[];
}

/** A change lifted out of its release, carrying enough context to link back. */
export interface ChangeInRelease extends Change {
	readonly release: {
		readonly version: string;
		readonly released: Date;
		readonly releaseType: ReleaseType;
	};
}

export interface TagUsage {
	readonly tag: string;
	readonly slug: string;
	readonly count: number;
}

export interface Cadence {
	/** Undefined only when the collection is empty. */
	readonly firstRelease?: Date;
	readonly lastRelease?: Date;
	readonly averageGapDays: number;
	readonly longestGapDays: number;
	/** The pair either side of the longest gap, older first. Empty until there are two releases. */
	readonly longestGapBetween?: readonly [string, string];
	/** One entry per calendar month between the first and last release. */
	readonly byMonth: readonly MonthCount[];
}

export interface MonthCount {
	/** `YYYY-MM`. */
	readonly month: string;
	readonly year: number;
	/** 1–12. */
	readonly monthOfYear: number;
	readonly count: number;
}

export interface Stats {
	readonly totalReleases: number;
	readonly releasesByType: Readonly<Record<ReleaseType, number>>;
	readonly totalChanges: number;
	readonly changesByType: Readonly<Record<ChangeType, number>>;
	readonly totalTags: number;
	readonly topTags: readonly TagUsage[];
	readonly knownIssues: {
		readonly total: number;
		readonly open: number;
		readonly resolved: number;
		readonly longestOpen?: KnownIssue;
	};
	/** Things fixed per thing still broken. `Infinity` when nothing is broken. */
	readonly fixedToBroken: number;
	readonly cadence: Cadence;
}

export interface KnownIssueSummary {
	/** Every known issue, newest-opened first. */
	readonly all: readonly KnownIssue[];
	/** Still broken, longest-open first. */
	readonly open: readonly KnownIssue[];
	/** Since fixed, most recently resolved first. */
	readonly resolved: readonly KnownIssue[];
}

export interface ReleaseIndex {
	/** Newest first. */
	readonly releases: readonly Release[];
	readonly byVersion: ReadonlyMap<string, Release>;
	readonly tags: readonly TagUsage[];
	readonly changesByTag: ReadonlyMap<string, readonly ChangeInRelease[]>;
	readonly changesByType: ReadonlyMap<ChangeType, readonly ChangeInRelease[]>;
	readonly knownIssues: readonly KnownIssue[];
	readonly openKnownIssues: readonly KnownIssue[];
	readonly resolvedKnownIssues: readonly KnownIssue[];
	readonly stats: Stats;
}

const DAY = 24 * 60 * 60 * 1000;

/** Tags are already kebab-case, so the slug is the tag. Centralised anyway. */
export function tagSlug(tag: string): string {
	return tag;
}

function monthKey(date: Date): string {
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The index of a collection with nothing in it. A changelog starts here. */
const EMPTY_CADENCE: Cadence = {
	averageGapDays: 0,
	longestGapDays: 0,
	byMonth: [],
};

export function buildIndex(raw: readonly RawRelease[]): ReleaseIndex {
	if (raw.length === 0) return EMPTY_INDEX;

	// Oldest first while deriving, because release type and prev/next are both
	// statements about what came before.
	const ascending = [...raw].sort((a, b) => compareVersions(a.version, b.version));

	const releases: Release[] = ascending
		.map((release, index): Release => {
			const changes: Change[] = release.changes.map((change) => ({
				type: change.type as ChangeType,
				text: change.text,
				tags: change.tags ?? [],
				id: change.id,
				resolves: change.resolves ?? [],
			}));

			const changesByType = CHANGE_TYPES.map((type) => ({
				type,
				changes: changes.filter((change) => change.type === type),
			})).filter((group) => group.changes.length > 0);

			return {
				version: release.version,
				released: release.released,
				summary: release.summary,
				changes,
				changesByType,
				releaseType: deriveReleaseType(
					release.version,
					index === 0 ? null : ascending[index - 1].version,
				),
				slug: release.version,
				previous: index > 0 ? ascending[index - 1].version : undefined,
				next: index < ascending.length - 1 ? ascending[index + 1].version : undefined,
			};
		})
		.reverse();

	const byVersion = new Map(releases.map((release) => [release.version, release]));

	/* ------------------------------------------------------------- tags */

	const tagCounts = new Map<string, number>();
	const changesByTag = new Map<string, ChangeInRelease[]>();
	const changesByType = new Map<ChangeType, ChangeInRelease[]>(
		CHANGE_TYPES.map((type) => [type, []]),
	);

	// Newest-first traversal, so every derived list inherits that order for free.
	for (const release of releases) {
		const context = {
			version: release.version,
			released: release.released,
			releaseType: release.releaseType,
		};

		for (const change of release.changes) {
			const lifted: ChangeInRelease = { ...change, release: context };
			changesByType.get(change.type)!.push(lifted);

			for (const tag of change.tags) {
				tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
				const bucket = changesByTag.get(tag);
				if (bucket === undefined) changesByTag.set(tag, [lifted]);
				else bucket.push(lifted);
			}
		}
	}

	const tags: TagUsage[] = [...tagCounts.entries()]
		.map(([tag, count]) => ({ tag, slug: tagSlug(tag), count }))
		// Most used first; alphabetical within a count so the order is stable.
		.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

	/* ---------------------------------------------------- known issues */

	const knownIssues = buildKnownIssues(ascending);
	const open = openKnownIssues(knownIssues);
	const resolved = resolvedKnownIssues(knownIssues);

	/* --------------------------------------------------------- cadence */

	const dates = ascending.map((release) => release.released);
	const gaps = dates.slice(1).map((date, index) => (date.getTime() - dates[index].getTime()) / DAY);
	const longestGapDays = gaps.length > 0 ? Math.max(...gaps) : 0;
	const longestGapAt = gaps.indexOf(longestGapDays);

	const counted = new Map<string, number>();
	for (const date of dates) counted.set(monthKey(date), (counted.get(monthKey(date)) ?? 0) + 1);

	// Every month in the span, including the empty ones — a heatmap with the
	// quiet months missing is not a heatmap, it is a list.
	const byMonth: MonthCount[] = [];
	const cursor = new Date(Date.UTC(dates[0].getUTCFullYear(), dates[0].getUTCMonth(), 1));
	const end = dates.at(-1)!;
	while (
		cursor.getUTCFullYear() < end.getUTCFullYear() ||
		(cursor.getUTCFullYear() === end.getUTCFullYear() && cursor.getUTCMonth() <= end.getUTCMonth())
	) {
		const key = monthKey(cursor);
		byMonth.push({
			month: key,
			year: cursor.getUTCFullYear(),
			monthOfYear: cursor.getUTCMonth() + 1,
			count: counted.get(key) ?? 0,
		});
		cursor.setUTCMonth(cursor.getUTCMonth() + 1);
	}

	const cadence: Cadence = {
		firstRelease: dates[0],
		lastRelease: dates.at(-1)!,
		averageGapDays: gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0,
		longestGapDays,
		longestGapBetween:
			gaps.length > 0
				? [ascending[longestGapAt].version, ascending[longestGapAt + 1].version]
				: undefined,
		byMonth,
	};

	/* ----------------------------------------------------------- stats */

	const releasesByType = { major: 0, minor: 0, patch: 0 };
	for (const release of releases) releasesByType[release.releaseType] += 1;

	const changeTypeCounts = Object.fromEntries(
		CHANGE_TYPES.map((type) => [type, changesByType.get(type)!.length]),
	) as Record<ChangeType, number>;

	const totalChanges = releases.reduce((total, release) => total + release.changes.length, 0);

	const stats: Stats = {
		totalReleases: releases.length,
		releasesByType,
		totalChanges,
		changesByType: changeTypeCounts,
		totalTags: tags.length,
		topTags: tags,
		knownIssues: {
			total: knownIssues.length,
			open: open.length,
			resolved: resolved.length,
			longestOpen: open[0],
		},
		fixedToBroken: open.length === 0 ? Number.POSITIVE_INFINITY : resolved.length / open.length,
		cadence,
	};

	return {
		releases,
		byVersion,
		tags,
		changesByTag,
		changesByType,
		knownIssues,
		openKnownIssues: open,
		resolvedKnownIssues: resolved,
		stats,
	};
}

/**
 * An empty collection is a legitimate day-one state for a changelog, not a
 * misconfiguration — malformed content already fails loudly at the schema, so
 * there is nothing here worth refusing to build over.
 */
const EMPTY_INDEX: ReleaseIndex = {
	releases: [],
	byVersion: new Map(),
	tags: [],
	changesByTag: new Map(),
	changesByType: new Map(CHANGE_TYPES.map((type) => [type, []])),
	knownIssues: [],
	openKnownIssues: [],
	resolvedKnownIssues: [],
	stats: {
		totalReleases: 0,
		releasesByType: { major: 0, minor: 0, patch: 0 },
		totalChanges: 0,
		changesByType: Object.fromEntries(CHANGE_TYPES.map((type) => [type, 0])) as Record<ChangeType, number>,
		totalTags: 0,
		topTags: [],
		knownIssues: { total: 0, open: 0, resolved: 0 },
		fixedToBroken: Number.POSITIVE_INFINITY,
		cadence: EMPTY_CADENCE,
	},
};
