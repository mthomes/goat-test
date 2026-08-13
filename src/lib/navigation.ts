/**
 * The primary navigation, and how a URL maps onto it.
 *
 * One source of truth so the running head, the nav and the `aria-current`
 * marker cannot disagree about which section a page belongs to.
 */
import { routes } from "./format.ts";

export interface NavItem {
	readonly label: string;
	readonly href: string;
	/** Section marker printed in the running head. */
	readonly marker: string;
}

export const NAVIGATION: readonly NavItem[] = [
	{ label: "Releases", href: routes.releases(), marker: "Releases" },
	{ label: "Tags", href: routes.tags(), marker: "Tags" },
	{ label: "Known Issues", href: routes.knownIssues(), marker: "Known Issues" },
	{ label: "Stats", href: routes.stats(), marker: "Stats" },
];

/** Sections that have a running-head marker but no nav item of their own. */
const EXTRA_MARKERS: ReadonlyArray<readonly [string, string]> = [
	[routes.changes(), "Changes"],
];

function normalise(pathname: string): string {
	return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
}

/**
 * The nav item a URL belongs to, or `undefined` off-navigation.
 *
 * A release detail page belongs to Releases: matching on the section rather
 * than on the exact URL is what stops the navigation going blank the moment a
 * reader follows a link into one.
 */
export function currentNavItem(pathname: string): NavItem | undefined {
	const path = normalise(pathname);
	return NAVIGATION.find((item) => path === item.href || path.startsWith(`${item.href}/`));
}

/** The section marker for the running head. */
export function sectionMarker(pathname: string): string | undefined {
	const path = normalise(pathname);
	if (path === routes.home()) return undefined;

	const item = currentNavItem(path);
	if (item) return item.marker;

	const extra = EXTRA_MARKERS.find(([href]) => path === href || path.startsWith(`${href}/`));
	return extra?.[1];
}
