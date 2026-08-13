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

## CI, and the required status checks

Every pull request runs six jobs. All six are **required status checks** for
branch protection on `main`:

| Check | What it gates |
| ----- | ------------- |
| `Lint, types, build` | Stylelint (including the CUBE layer rules), the no-`<style>`-block grep, `astro check`, and a production build — which is where content-schema violations surface |
| `Unit + coverage` | Vitest with v8 coverage; thresholds are 90% statements / 85% branches on `src/lib/**` |
| `Guardrails` | Zero-JS budget and cascade integrity, asserted against `dist/` |
| `E2E 1/4`–`4/4` | Playwright across Chromium, Firefox, WebKit, a 320px viewport and the dark scheme — including the axe and contrast suites |
| `Visual regression` | 36 screenshot baselines against the committed Linux set |
| `Requirement traceability` | `npm run trace -- --strict` — **any issue with acceptance criteria and no covering test fails the build** |

`Lighthouse / Budgets` runs as a separate workflow and is also required:
performance ≥ 98, accessibility = 100, best practices ≥ 95, and zero bytes of
JavaScript.

To set them up:

```sh
gh api -X PUT repos/mthomes/goat-test/branches/main/protection/required_status_checks \
  -f strict=true \
  -f 'contexts[]=Lint, types, build' \
  -f 'contexts[]=Unit + coverage' \
  -f 'contexts[]=Guardrails' \
  -f 'contexts[]=Visual regression' \
  -f 'contexts[]=Requirement traceability' \
  -f 'contexts[]=Budgets'
```

The E2E suite is sharded four ways to keep wall-clock down; the shards produce
blob reports that a follow-up job merges into a single HTML report.

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
| `npm run test:guardrails` | Zero-JS and cascade-integrity assertions over `dist/` |
| `npm run test:visual` | Visual regression against committed baselines |
| `npm run test:lighthouse` | Lighthouse budgets against a production build |
| `npm run lint:css` | Stylelint, including the CUBE layer rules |
| `npm run trace` | Requirement traceability report |

## Visual regression

```sh
npm run test:visual                        # compare against the baselines
npm run test:visual -- --update-snapshots  # accept the current rendering
```

Baselines live in `tests/visual/__screenshots__/<platform>/<scheme>/` and are
committed. Six pages × two colour schemes × three widths = **36 per platform**.

**The platform matters.** CI runs on Linux and renders type differently from a
developer's Mac — same fonts, different rasteriser. Both sets are committed, and
Playwright picks the right one automatically. If you update baselines on macOS,
regenerate the Linux set too or CI will fail:

```sh
docker run --rm -v "$PWD":/work -v /work/node_modules -v /work/dist \
  -w /work --ipc=host mcr.microsoft.com/playwright:v1.62.1-noble \
  bash -lc "npm ci && npx playwright test --config=playwright.visual.config.ts --update-snapshots"
```

Mounting anonymous volumes over `node_modules` and `dist` is not optional — the
host's are built for macOS and the container will overwrite them otherwise.

Update baselines only when a rendering change is **intended**, and say so in the
PR. That is the entire value of the suite.
