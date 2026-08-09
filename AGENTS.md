# AGENTS.md

Effect v4 TypeScript monorepo boilerplate. Toolchain, lint rules, conventions — no product code.
Members live in `packages/*`. `packages/tsconfig` holds the shared TS base every member extends.

Toolchain is oxc + TypeScript 7: `oxlint` (lint), `oxfmt` (format), `typescript@7` with
`@effect/tsgo`. No ESLint, no dprint, no Prettier.

:::warning
Lint runs as `bunx --bun oxlint`, never bare `oxlint`. The local rules are TypeScript
(`lint/plugin.ts`, built on `effect-oxlint`), and oxlint imports its JS plugins with whatever
runtime is executing it. `node_modules/.bin/oxlint` is `#!/usr/bin/env node`, which dies on a `.ts`
plugin with `ERR_UNKNOWN_FILE_EXTENSION` (measured). `--bun` is what makes it Bun's import.

`effect` is pinned EXACTLY at the version `effect-oxlint` peer-requires; it is a lint dependency
here, not product code.
:::

The ~84 `effecttsgo/*` Effect rules come from `@effect/tsgo`'s `recommended` preset, which
`.oxlintrc.json` extends. They are type-aware, and the preset turns type-aware mode on — which is
why no `--type-aware` flag appears in the scripts.

The preset ships most of them as `warn`, so every lint invocation passes `--deny-warnings`: a
warning that cannot fail the gate is one nobody fixes. Downgrade individual rules in
`.oxlintrc.json` rather than dropping the flag.

:::warning
`prepare` runs `effect-tsgo patch --oxlint`, which patches the oxlint and TypeScript binaries in
`node_modules`. Without it the Effect rules do not run. It is not optional and it re-runs on every
install — do not "simplify" `prepare` down to `husky`.

It also validates that `oxlint`, `oxlint-tsgolint` and `@effect/tsgo` are a supported triple, so
bump the three together.
:::

:::warning
`typescript` is pinned EXACTLY (no `^`). `@effect/tsgo` ships prebuilt artifacts for specific
TypeScript builds and fails with `ReplacementUnavailableError: Missing packaged artifact` against any
other one. Bump it with `@effect/tsgo`, or not at all.
:::

Effect diagnostics are reported by oxlint only: the language-service plugin in
`packages/tsconfig/base.json` sets `diagnostics: false` so they do not appear twice.

## First

:::warning
Invoke the `effect-best-practices` skill before writing Effect code. Follow it as absolute truth.
Do not duplicate it here — read it.
:::

Gate every change, all four:

```sh
bun run typecheck && bun run lint && bun run test && bun run fmt:check
```

Auto-fix: `bun run lint:fix && bun run fmt`. Run `fmt` before `lint:fix` — formatting moves line
breaks, and the spacing rules judge the result.

## Layout

- Shared code goes in a `packages/*` member, reached by package specifier — never a relative path
  across members. Not lintable in a flat layout (a sibling climb spells `../../other`, naming no
  directory), so it is on you. If the import you want is not exported, export it.
- `packages/tsconfig` has no `scripts` at all: it ships a tsconfig and nothing runnable.
- Root `tsconfig.json` covers `lint/` — the repo's own tooling belongs to no member, and without it
  the type-aware pass sees `Bun` as unresolved.

:::warning
Every member with source needs a `test` script. The gate runs
`bun run --filter '*' --if-present test`, so a member without one is **skipped silently**, not
reported.
:::

## Rules

Leaf imports only: `effect/Effect`, `effect/unstable/cli/Command`.

:::warning
Every barrel is banned — the `effect` root AND each subpath index (`effect/unstable/schema`,
`effect/testing`, …). The subpath ones are what keep getting written. Enforced by a regex in
`no-restricted-imports`: a barrel is the bare root, `effect/testing`, or a single lowercase segment
under `unstable/`, since every leaf module is PascalCase. Type-only imports are exempt.
:::

:::warning
Never read `_tag`. The `_` prefix means private. Use `Match.tag`/`Match.tags`/`Match.tagsExhaustive`,
a library guard (`Cause.isTimeoutError`, `Exit.isFailure`, `Result.isFailure`), or `instanceof` where
the module instance is shared. Prefer exhaustive so a new variant fails to compile.
Enforced: `local/no-tag-access`.

Nested `reason` unions too — `SqlError`/`AiError` put the variant in `reason`, out of the failure
channel, so `catchTag` misses it and some `effect-best-practices` snippets write `error.reason._tag`.
Replacements per `references/core/error-handling.md`: `Effect.catchReason`, `Effect.catchReasons`,
`Effect.unwrapReason` + `catchTags`, or `Match.value(error.reason).pipe(Match.tagsExhaustive({…}))`.
Disable-comment only after all four fail; say which in the comment.
:::

:::warning
Error schema fields must not shadow `Error`'s own. Fields are assigned onto the instance, so a `name`
or `stack` field replaces what identifies the error as an error — `Cause.pretty`, `String(error)`,
the stack header, OTLP `exception.type`/`exception.stacktrace` all read it (measured). Name for what
it holds (`userName`), not where it sits. `message`/`cause` stay legal.
Enforced: `local/no-shadowed-error-field`.
:::

- Errors are `Schema.TaggedErrorClass` with a `message` getter: full sentence, names the fix where
  possible. One reporter prints `error.message`; an error without one exits silently.
- Module-level primitive constants are `SCREAMING_SNAKE_CASE` — they are the knobs and magic values,
  and the casing separates them from computed bindings. **Not enforced**: oxlint has no
  `naming-convention`, and the type filter that made the ESLint rule precise needs type info. Review
  catches this one.
- Comments explain WHY, and are short and few. One recording a fact that is expensive to rediscover
  earns its place; one narrating the code does not. Prefer a single line to a paragraph.
- Descriptive, boring names. Long over clever. No abbreviations needing a decoder.
- Temp work in `tmp/` (gitignored), never `/tmp`.

:::warning
A number in a comment must be one somebody measured. If you are reaching for a plausible one, you do
not have the fact yet.
:::

Local rules in `lint/`, written with `effect-oxlint` and assembled by `Plugin.define` in
`lint/plugin.ts`:

- `statement-order` — imports > type-defs > constants > functions > variables > modules > exports.
- `expect-padding` — a run of `expect()` is ONE block: blank line around it, none inside.
- `padding-line-between-statements` — the vertical-spacing spec, ported from `@stylistic`; oxlint has
  no equivalent. The spec stays declarative in `.oxlintrc.json`, as ONE array argument — `Rule.define`
  decodes `options[0]` only — validated by a `Schema` rather than by hand.
- `no-tag-access` — no `x._tag`, `switch (x._tag)`, `const { _tag } = x`. Defining a tag is fine.
- `no-shadowed-error-field` — no `name`/`stack` field on `TaggedErrorClass`/`ErrorClass`.

Writing one: `Rule.define({ name, meta: Rule.meta(…), options?, create: function*() {…} })`, whose
`create` yields `RuleContext` and returns a visitor of `(node) => Effect<void, never, RuleContext>`.
Report with `context.report(Diagnostic.fromId(…))`, fix with `Diagnostic.withFix`.

:::warning
A rule taking options needs `meta.schema` as well as `options` — oxlint refuses options outright when
`schema` is absent, before the Effect `Schema` ever runs. `Rule.meta` does not carry it, so spread it
in.

Visitor handlers take `ESTree.Node`, not the narrowed type. `TypedEffectVisitor` maps over oxlint's
`Visitor`, which intersects a `Record<string, (node: Node) => void>` catch-all over its per-key
handlers, collapsing every key to that signature. Narrow inside the handler.
:::

:::caution
oxlint's JS plugin support is **alpha and explicitly not semver-bound** (per its shipped config
schema). All five local rules ride on it. An oxlint upgrade can break them without a major bump —
`bun run test` is what catches that, so run it after any oxlint bump. Bump `effect-oxlint` with it:
it pins `@oxlint/plugins`.
:::

## Establishing a fact

Do not guess about Effect, oxc or Bun. Do not trust a plausible claim in a review.

:::tip
1. Read `node_modules/effect/src/**` — ground truth for API shape, and grepping it settles "is this
   idiomatic" (e.g. `S["Type"]` appears 177 times in `Schema.ts`). Before anything depends on
   `effect`, the hoisted copy is the same source: `node_modules/.bun/effect@*/node_modules/effect/src/**`.
   For oxlint and oxfmt, `node_modules/{oxlint,oxfmt}/configuration_schema.json` is the authoritative
   list of every option and rule — better than the docs, and it is what shipped.
2. Probe behaviour — throwaway `__probe.ts` in `tmp/`, run with `bun`, delete after. Probing oxlint
   is the exception: it skips gitignored paths, and `tmp/` is gitignored, so it reports "No files
   found to lint". Put those probes in `lint/__probe*` and delete after.
3. Prove a lint rule REJECTS, not just that it passes clean code. `lint/rules.test.ts` is the shape:
   a fixture that MUST be rejected, at known lines.
4. Record it — a comment at the site when the fact explains one line, a ledger otherwise.
:::

:::warning
`lint/fixtures/` is deliberately malformed — it is the rule tests' input. It is excluded from both
oxlint and oxfmt. Formatting it would repair the violations and turn those tests green against
nothing.
:::

## Changing this file

Where review feedback gets settled once instead of repeated.

Trigger: repetition, or obvious generality. Asked twice = already a pattern, codify then. A first
request that is plainly general (`never read _tag` is about every file) gets promoted immediately.

Strongest enforcement available, in order:

1. An oxlint rule — machine-checked, cannot drift, often auto-fixable. Prefer a built-in; write a
   local JS-plugin rule only when oxlint has none, and test it.
2. A line here — every agent reads it, but prose can be misread.
3. A comment at the call site — for a one-off fact, not a rule.

Codify in the same change as the fix, never "later"; a pattern living only in a conversation dies
with the session.

:::warning
Rules are not immutable. When the user contradicts one, fix the rule — do not special-case the call
site. `expect-padding` was built from a misread brief and had to be inverted; that was a bug in the
rule, not licence for an exception.
:::

Do not over-codify. A preference about one file, or a judgement needing taste, is not a pattern.
