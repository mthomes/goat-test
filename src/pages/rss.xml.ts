/**
 * The release history as a feed.
 *
 * A structured schema means feed items have to be *composed* rather than
 * dumped: a reader that received raw frontmatter would show a wall of YAML.
 * Items are rendered as readable HTML using the same grouping order as the
 * release detail page, so the feed and the site tell the same story.
 */
import rss from "@astrojs/rss";
import type { APIRoute } from "astro";

import { changeTypeLabel, formatDate, pluralise, routes } from "../lib/format.ts";
import { getAllReleases, type Release } from "../lib/queries.ts";
import { SITE } from "../lib/site.ts";

/**
 * The absolute URL of a release page.
 *
 * Built here rather than left to `@astrojs/rss`, which resolves a relative
 * item link against the *origin* of `site` and so silently drops the
 * `/goat-test` path the project is published under.
 */
function releaseUrl(version: string, site: URL): string {
	return new URL(routes.release(version), site).href;
}

/** Escapes text for inclusion in the CDATA-free HTML body of an item. */
function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function renderItem(release: Release, site: URL): string {
	const parts: string[] = [];

	if (release.summary) parts.push(`<p>${escapeHtml(release.summary)}</p>`);

	for (const group of release.changesByType) {
		parts.push(`<h2>${escapeHtml(changeTypeLabel(group.type))}</h2>`);
		parts.push(
			`<ul>${group.changes
				.map((change) => {
					const tags = change.tags.length > 0
						? ` <em>(${change.tags.map(escapeHtml).join(", ")})</em>`
						: "";
					return `<li>${escapeHtml(change.text)}${tags}</li>`;
				})
				.join("")}</ul>`,
		);
	}

	parts.push(
		`<p><a href="${releaseUrl(release.version, site)}">`
		+ `Full release notes for v${release.version}</a></p>`,
	);

	return parts.join("\n");
}

export const GET: APIRoute = async (context) => {
	const site = context.site!;
	const releases = await getAllReleases();

	return rss({
		title: `${SITE.name} — ${SITE.tagline}`,
		description: SITE.description,
		site,
		trailingSlash: false,
		items: releases.map((release) => ({
			title: `v${release.version}`,
			link: releaseUrl(release.version, site),
			pubDate: release.released,
			description:
				release.summary
				?? `${pluralise(release.changes.length, "change")} on ${formatDate(release.released)}.`,
			content: renderItem(release, site),
		})),
		customData: "<language>en-gb</language>",
	});
};
