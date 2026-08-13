/**
 * `robots.txt`, generated so the sitemap URL cannot drift away from the site
 * URL configured in `astro.config.mjs`.
 */
import type { APIRoute } from "astro";

import { routes } from "../lib/format.ts";

export const GET: APIRoute = ({ site }) => {
	const sitemap = new URL(routes.asset("/sitemap-index.xml"), site!).href;

	return new Response(
		["User-agent: *", "Allow: /", "", `Sitemap: ${sitemap}`, ""].join("\n"),
		{ headers: { "content-type": "text/plain; charset=utf-8" } },
	);
};
