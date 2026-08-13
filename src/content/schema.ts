/**
 * The shape of a release. Every page on this site reads from it.
 *
 * Authored here as a plain Zod schema rather than inline in the collection
 * definition so it can be exercised directly by unit tests without booting
 * Astro's `astro:content` virtual module. `config.ts` hands it to
 * `defineCollection`.
 */
import { z } from "zod";

/**
 * Strict semver core. Deliberately narrower than the full semver grammar:
 * this project has no prereleases and no build metadata, and #20 parses every
 * version into `{ major, minor, patch }`, so anything that would not survive
 * that round-trip is a content bug rather than a version.
 *
 * Rejects: `1.2`, `1.2.3.4`, `v1.2.3`, `01.2.3`, `1.2.3-beta`, `` .
 */
export const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Kebab-case, so known-issue ids are usable verbatim in URLs and anchors. */
export const KNOWN_ISSUE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const CHANGE_TYPES = [
	"added",
	"fixed",
	"changed",
	"removed",
	"deprecated",
	"known-issue",
] as const;

export type ChangeType = (typeof CHANGE_TYPES)[number];

const changeSchema = z
	.object({
		type: z.enum(CHANGE_TYPES),
		text: z.string().min(1, "A change entry needs text."),
		tags: z.array(z.string().regex(KNOWN_ISSUE_ID_PATTERN)).nonempty().optional(),
		/** Required on `known-issue` entries, forbidden on every other type. */
		id: z.string().regex(KNOWN_ISSUE_ID_PATTERN).optional(),
		/** Known-issue ids this change closes. Resolved across the collection in #21. */
		resolves: z.array(z.string().regex(KNOWN_ISSUE_ID_PATTERN)).nonempty().optional(),
	})
	.superRefine((change, ctx) => {
		if (change.type === "known-issue" && change.id === undefined) {
			ctx.addIssue({
				code: "custom",
				path: ["id"],
				message: "A `known-issue` entry needs a stable `id` so later releases can resolve it.",
			});
		}

		if (change.type !== "known-issue" && change.id !== undefined) {
			ctx.addIssue({
				code: "custom",
				path: ["id"],
				message: `\`id\` belongs only on \`known-issue\` entries, not on \`${change.type}\`.`,
			});
		}

		if (change.type === "known-issue" && change.resolves !== undefined) {
			ctx.addIssue({
				code: "custom",
				path: ["resolves"],
				message: "A `known-issue` entry cannot resolve anything — it is the thing being resolved.",
			});
		}
	});

export type Change = z.infer<typeof changeSchema>;

/**
 * Known-issue ids must be unique across the *whole* collection, not merely
 * within a release — an id is the join key the entire known-issue lifecycle
 * (#21) hangs off, and two releases claiming the same one would silently
 * produce a nonsense timeline.
 *
 * Astro validates entries one at a time, so uniqueness is tracked in module
 * scope. The registry maps an id to the version that declared it rather than
 * to a bare `Set`, so re-validating the same file during a dev-server rebuild
 * overwrites its own entry instead of colliding with it.
 */
const knownIssueOwners = new Map<string, string>();

/** Exposed for tests, which need each case to start from a clean registry. */
export function resetKnownIssueRegistry(): void {
	knownIssueOwners.clear();
}

export const releaseSchema = z
	.object({
		version: z
			.string()
			.regex(VERSION_PATTERN, "Not a `major.minor.patch` version string."),
		released: z.date(),
		summary: z.string().min(1).optional(),
		changes: z.array(changeSchema).min(1, "A release with no changes is not a release."),
	})
	.superRefine((release, ctx) => {
		release.changes.forEach((change, index) => {
			if (change.type !== "known-issue" || change.id === undefined) return;

			const owner = knownIssueOwners.get(change.id);
			if (owner !== undefined && owner !== release.version) {
				ctx.addIssue({
					code: "custom",
					path: ["changes", index, "id"],
					message: `Duplicate known-issue id "${change.id}" — already declared by ${owner}.`,
				});
				return;
			}

			knownIssueOwners.set(change.id, release.version);
		});

		const withinRelease = new Set<string>();
		release.changes.forEach((change, index) => {
			if (change.type !== "known-issue" || change.id === undefined) return;
			if (withinRelease.has(change.id)) {
				ctx.addIssue({
					code: "custom",
					path: ["changes", index, "id"],
					message: `Duplicate known-issue id "${change.id}" within ${release.version}.`,
				});
			}
			withinRelease.add(change.id);
		});
	});

export type Release = z.infer<typeof releaseSchema>;
