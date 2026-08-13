/**
 * The one module every page imports from.
 *
 * No page calls `getCollection` directly and no page re-derives anything: the
 * whole index is built once, on first access, and every query below is a read
 * off it. That is the seam that keeps the aggregate-view pages trivial — each
 * of them should be a template over a single call from here.
 */
import { getCollection, getEntry, render } from "astro:content";

import {
	buildIndex,
	type ChangeInRelease,
	type ChangeType,
	type KnownIssueSummary,
	type Release,
	type ReleaseIndex,
	type Stats,
	type TagUsage,
} from "./release-index.ts";

export type {
	Cadence,
	Change,
	ChangeGroup,
	ChangeInRelease,
	ChangeType,
	MonthCount,
	Release,
	Stats,
	TagUsage,
} from "./release-index.ts";
export type { KnownIssue, KnownIssueStatus } from "./known-issues.ts";
export { CHANGE_TYPES, RESOLVED_CHANGE_TYPES, tagSlug } from "./release-index.ts";

/**
 * Built once per process. Astro renders every route in a single build, so this
 * is one traversal of the collection for the whole site rather than one per
 * page — and `loadCount` exists so a test can prove that rather than assume it.
 */
let cached: ReleaseIndex | undefined;
let loadCount = 0;

async function index(): Promise<ReleaseIndex> {
	if (cached === undefined) {
		loadCount += 1;
		const entries = await getCollection("releases");
		cached = buildIndex(entries.map((entry) => entry.data));
	}
	return cached;
}

/** How many times the collection has actually been read. Tests only. */
export function collectionReadCount(): number {
	return loadCount;
}

/** Every release, newest first, with its derived release type attached. */
export async function getAllReleases(): Promise<readonly Release[]> {
	return (await index()).releases;
}

/** One release by its version string, or `undefined` if there is no such version. */
export async function getReleaseByVersion(version: string): Promise<Release | undefined> {
	return (await index()).byVersion.get(version);
}

/** Every tag in use with its count, most used first. */
export async function getAllTags(): Promise<readonly TagUsage[]> {
	return (await index()).tags;
}

/** Every change carrying a tag, newest first, each carrying its parent release. */
export async function getChangesByTag(tag: string): Promise<readonly ChangeInRelease[]> {
	return (await index()).changesByTag.get(tag) ?? [];
}

/** Every change of a type, newest first, each carrying its parent release. */
export async function getChangesByType(type: ChangeType): Promise<readonly ChangeInRelease[]> {
	return (await index()).changesByType.get(type) ?? [];
}

/** Every known issue with its resolution state, newest-opened first. */
export async function getKnownIssues(): Promise<KnownIssueSummary> {
	const { knownIssues, openKnownIssues, resolvedKnownIssues } = await index();
	return { all: knownIssues, open: openKnownIssues, resolved: resolvedKnownIssues };
}

/**
 * The rendered markdown body of a release, when it has one.
 *
 * Pages read their prose through here rather than reaching for `getEntry`
 * themselves, so `astro:content` stays behind this one module.
 */
export async function getReleaseBody(version: string) {
	const entry = await getEntry("releases", version);
	if (entry === undefined) return undefined;

	const { Content } = await render(entry);
	return entry.body?.trim() ? Content : undefined;
}

/** Aggregate figures over the whole history. Nothing on /stats is computed twice. */
export async function getStats(): Promise<Stats> {
	return (await index()).stats;
}
