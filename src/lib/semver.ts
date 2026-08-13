/**
 * Reasoning about version numbers.
 *
 * Release type is *derived* here and never authored. Storing `type: minor` in
 * frontmatter would let it drift out of sync with the version number sitting
 * three lines above it, and the whole site — the archive headings, the stats
 * split, the exception-layer styling — reads from that one derived value.
 */

export interface Version {
	readonly major: number;
	readonly minor: number;
	readonly patch: number;
}

export type ReleaseType = "major" | "minor" | "patch";

/** Same shape the content schema validates against. */
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Parse `"31.4.2"` into its parts. Throws on anything else. */
export function parseVersion(input: string): Version {
	const parsed = tryParseVersion(input);
	if (parsed === null) {
		throw new TypeError(`Not a major.minor.patch version string: ${JSON.stringify(input)}`);
	}
	return parsed;
}

/** Non-throwing `parseVersion`, for validating input that may be user-shaped. */
export function tryParseVersion(input: string): Version | null {
	const match = VERSION_PATTERN.exec(input);
	if (match === null) return null;
	return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function toVersion(value: Version | string): Version {
	return typeof value === "string" ? parseVersion(value) : value;
}

/** Ascending: oldest first. Negative when `a` precedes `b`. */
export function compareVersions(a: Version | string, b: Version | string): number {
	const left = toVersion(a);
	const right = toVersion(b);
	return (
		left.major - right.major ||
		left.minor - right.minor ||
		left.patch - right.patch
	);
}

/** Descending: newest first. The order every list on the site is built in. */
export function byNewestFirst(a: Version | string, b: Version | string): number {
	return -compareVersions(a, b);
}

/**
 * The kind of release `version` is, judged against the one before it.
 *
 * With no predecessor — the first release in the record — the shape of the
 * version itself decides: `x.0.0` is a major, `x.y.0` a minor, anything else
 * a patch.
 */
export function deriveReleaseType(
	version: Version | string,
	previous?: Version | string | null,
): ReleaseType {
	const current = toVersion(version);

	if (previous === undefined || previous === null) {
		if (current.minor === 0 && current.patch === 0) return "major";
		if (current.patch === 0) return "minor";
		return "patch";
	}

	const before = toVersion(previous);
	if (current.major !== before.major) return "major";
	if (current.minor !== before.minor) return "minor";
	return "patch";
}

export interface MajorGroup<T> {
	readonly major: number;
	readonly items: readonly T[];
}

/**
 * Group items under their major version, newest major first and newest item
 * first within each — the order the archive prints them in.
 */
export function groupByMajor<T>(
	items: readonly T[],
	getVersion: (item: T) => Version | string,
): MajorGroup<T>[] {
	const groups = new Map<number, T[]>();

	for (const item of items) {
		const { major } = toVersion(getVersion(item));
		const group = groups.get(major);
		if (group === undefined) groups.set(major, [item]);
		else group.push(item);
	}

	return [...groups.entries()]
		.sort(([a], [b]) => b - a)
		.map(([major, group]) => ({
			major,
			items: [...group].sort((a, b) => byNewestFirst(getVersion(a), getVersion(b))),
		}));
}

/** For display: `v31.4.2`. The `v` is typographic, not part of the version. */
export function formatVersion(version: Version | string): string {
	const { major, minor, patch } = toVersion(version);
	return `v${major}.${minor}.${patch}`;
}

/** For URLs: `31.4.2`. Bare, so `/releases/31.4.2` reads as a coordinate. */
export function versionSlug(version: Version | string): string {
	const { major, minor, patch } = toVersion(version);
	return `${major}.${minor}.${patch}`;
}
