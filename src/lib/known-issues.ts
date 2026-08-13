/**
 * The known-issue lifecycle — the model that makes this more than a list of
 * posts. An issue opens in one release, sits there being a known issue, and
 * is closed by a `resolves:` reference from a later one.
 *
 * Both failure modes here break the build rather than warning. A dangling
 * reference that silently rendered as "still open" is the exact bug this
 * model exists to prevent: the page would look completely plausible and be
 * wrong, and nobody would ever notice.
 */
import { byNewestFirst, compareVersions } from "./semver.ts";

export interface KnownIssueChange {
	readonly type: string;
	readonly text: string;
	readonly tags?: readonly string[];
	readonly id?: string;
	readonly resolves?: readonly string[];
}

export interface ReleaseLike {
	readonly version: string;
	readonly released: Date;
	readonly changes: readonly KnownIssueChange[];
}

export type KnownIssueStatus = "open" | "resolved";

export interface KnownIssue {
	readonly id: string;
	readonly text: string;
	readonly tags: readonly string[];
	readonly status: KnownIssueStatus;
	/** The version that declared it, and when that shipped. */
	readonly openedIn: string;
	readonly openedOn: Date;
	/** The version that closed it, if any. */
	readonly resolvedIn?: string;
	readonly resolvedOn?: Date;
	/** The text of the change that closed it — what the reader wants to see. */
	readonly resolvedBy?: string;
	/**
	 * How many releases the issue has stood for. Zero means it opened in the
	 * most recent release (or, once resolved, in the one that closed it).
	 * Counted in releases rather than days on purpose: a gap of eight months
	 * with no release is not eight months of an issue being ignored.
	 */
	readonly ageInReleases: number;
}

/** Thrown for content that would otherwise render as plausible nonsense. */
export class KnownIssueError extends Error {
	override readonly name = "KnownIssueError";
}

/**
 * Resolve every `resolves:` reference across the whole collection and derive
 * each known issue's status, span and age.
 *
 * Returns issues newest-opened first; `openKnownIssues` re-sorts for the
 * tracker.
 */
export function buildKnownIssues(releases: readonly ReleaseLike[]): KnownIssue[] {
	// Oldest first, so an index is an age.
	const ordered = [...releases].sort((a, b) => compareVersions(a.version, b.version));
	const indexOf = new Map(ordered.map((release, index) => [release.version, index]));
	const latest = ordered.length - 1;

	interface Declaration {
		release: ReleaseLike;
		change: KnownIssueChange;
	}

	const declared = new Map<string, Declaration>();
	for (const release of ordered) {
		for (const change of release.changes) {
			if (change.type !== "known-issue" || change.id === undefined) continue;
			declared.set(change.id, { release, change });
		}
	}

	interface Resolution {
		release: ReleaseLike;
		change: KnownIssueChange;
	}

	const resolutions = new Map<string, Resolution>();
	for (const release of ordered) {
		for (const change of release.changes) {
			for (const id of change.resolves ?? []) {
				const declaration = declared.get(id);

				if (declaration === undefined) {
					throw new KnownIssueError(
						`${release.version} resolves "${id}", which no release ever opened. `
						+ `Known issues declared so far: ${[...declared.keys()].join(", ") || "none"}.`,
					);
				}

				const openedAt = indexOf.get(declaration.release.version)!;
				const resolvedAt = indexOf.get(release.version)!;

				if (resolvedAt < openedAt) {
					throw new KnownIssueError(
						`${release.version} resolves "${id}", but ${declaration.release.version} `
						+ "opened it — a resolution cannot predate the release it closes.",
					);
				}

				if (resolvedAt === openedAt) {
					throw new KnownIssueError(
						`${release.version} both opens and resolves "${id}". `
						+ "An issue closed by the release that declared it is not a known issue.",
					);
				}

				// First resolution wins; a later release re-resolving a closed
				// issue is a content bug, but a harmless one to ignore.
				if (!resolutions.has(id)) resolutions.set(id, { release, change });
			}
		}
	}

	return [...declared.entries()]
		.map(([id, { release, change }]) => {
			const openedAt = indexOf.get(release.version)!;
			const resolution = resolutions.get(id);
			const closedAt = resolution ? indexOf.get(resolution.release.version)! : latest;

			return {
				id,
				text: change.text,
				tags: change.tags ?? [],
				status: resolution ? ("resolved" as const) : ("open" as const),
				openedIn: release.version,
				openedOn: release.released,
				resolvedIn: resolution?.release.version,
				resolvedOn: resolution?.release.released,
				resolvedBy: resolution?.change.text,
				ageInReleases: closedAt - openedAt,
			};
		})
		.sort((a, b) => byNewestFirst(a.openedIn, b.openedIn));
}

/** Everything still broken, longest-open first — the top of the tracker. */
export function openKnownIssues(issues: readonly KnownIssue[]): KnownIssue[] {
	return issues
		.filter((issue) => issue.status === "open")
		.sort(
			(a, b) =>
				b.ageInReleases - a.ageInReleases ||
				// Same age means the same opening release; order is then stable
				// and arbitrary, so fix it by id rather than leave it to sort.
				a.id.localeCompare(b.id),
		);
}

/** Everything since fixed, most recently resolved first. */
export function resolvedKnownIssues(issues: readonly KnownIssue[]): KnownIssue[] {
	return issues
		.filter((issue) => issue.status === "resolved")
		.sort((a, b) => byNewestFirst(a.resolvedIn!, b.resolvedIn!));
}
