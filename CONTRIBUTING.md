# Contributing

Everything here is built from the issues on
[the project board](https://github.com/users/mthomes/projects/1). Read the
hard constraints in [`AGENTS.md`](./AGENTS.md) before changing anything —
they are not preferences.

## Requirement traceability

**Every test is tagged with the number of the issue it proves.**

Statement coverage tells you which lines ran. It does not tell you whether the
thing the ticket asked for actually works, and it will happily sit at 95% while
an acceptance criterion goes unimplemented. Tagging closes that gap: the report
walks backwards from the tags to the requirement set and names the issues that
nothing proves.

### The convention

**Playwright** — use the `tag` option. One test may prove criteria on more than
one issue, so the tag is a list:

```ts
import { expect, test } from "@playwright/test";

test.describe("release detail", () => {
  test(
    "groups changes by type under small-caps labels",
    { tag: ["@issue-25", "@issue-24"] },
    async ({ page }) => {
      await page.goto("/releases/31.0.0");
      await expect(page.getByRole("heading", { name: "ADDED" })).toBeVisible();
    },
  );
});
```

**Vitest** — put the tag at the front of the `describe` title. Everything inside
inherits it:

```ts
import { describe, expect, it } from "vitest";
import { parseVersion } from "./semver.ts";

describe("@issue-20 semver parsing", () => {
  it("parses a version into major, minor and patch", () => {
    expect(parseVersion("31.4.2")).toEqual({ major: 31, minor: 4, patch: 2 });
  });
});
```

Both land in the same report. The scanner is a grep for `@issue-NN` across
`src/**` and `tests/**`, so the tag has to appear literally — don't build it
from a variable.

### The report

```sh
npm run trace              # print the table, always exit 0
npm run trace -- --strict  # exit 1 on an uncovered issue or an unknown tag
npm run trace:sync         # refresh requirements.json from GitHub
```

It prints a row per issue — the covering tests, or a loud **0** — and then two
lists:

- **Issues with zero covering tests.** An issue with acceptance criteria and
  nothing proving them is not done, whatever the checkboxes say.
- **Tags referencing a non-existent issue.** Catches `@issue-2` where you meant
  `@issue-20`, which would otherwise look like coverage.

Epics are exempt. They carry no acceptance criteria of their own and close when
their children close.

`requirements.json` is a committed snapshot of the issue list. The report reads
it rather than calling the GitHub API, so it is deterministic, works offline,
and makes the requirement set itself reviewable in a diff. Re-run
`npm run trace:sync` when issues are added, renamed or relabelled.

CI prints the table to the job summary on every run.

## Working a ticket

1. Branch off `main`.
2. Implement, satisfying **every** acceptance-criteria checkbox.
3. Write the tests named in that ticket's Verification section, tagged
   `@issue-NN`.
4. Open a PR referencing the issue. CI must be green.
5. Tick only the checkboxes you have actually verified. A criterion you could
   not satisfy stays unticked and the issue stays open.

## Scripts

| Script | Does |
| ------ | ---- |
| `npm run dev` / `build` / `preview` | The usual |
| `npm run check` | `astro check` |
| `npm run lint:style-blocks` | Fails on a `<style>` block in any `.astro` file |
| `npm run test:unit` | Vitest, single run (`-- --watch` to watch) |
| `npm run test:unit:coverage` | …with v8 coverage into `coverage/` |
| `npm run test:e2e` | Playwright against a production build |
| `npm run trace` | Requirement traceability report |
