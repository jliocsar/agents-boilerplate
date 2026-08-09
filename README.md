# agents-boilerplate

An Effect v4 TypeScript monorepo starting point: toolchain, lint rules and conventions, no product
code. Clone it, add a package under `packages/`, and the gate is already wired.

`AGENTS.md` is the full spec and the thing agents read. This file is the short human version.

## Toolchain

Everything is oxc + TypeScript 7. No ESLint, no dprint, no Prettier.

| Tool                                                                                                             | Job                                           |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| [oxlint](https://oxc.rs)                                                                                         | Lint, including the type-aware pass           |
| [oxfmt](https://oxc.rs)                                                                                          | Format                                        |
| [typescript@7](https://github.com/microsoft/typescript-go) + [`@effect/tsgo`](https://github.com/Effect-TS/tsgo) | Typecheck, and ~84 Effect-specific lint rules |
| [`effect-oxlint`](https://github.com/mpsuesser/effect-oxlint)                                                    | The five local lint rules, written in Effect  |
| [Bun](https://bun.sh)                                                                                            | Runtime, package manager, test runner         |

## Getting started

```sh
bun install
```

`prepare` runs `husky && effect-tsgo patch --oxlint`. That patch is what makes the Effect rules run
at all, so an install you skip is an install whose lint is quietly weaker. It re-runs on every
install and validates that `oxlint`, `oxlint-tsgolint` and `@effect/tsgo` are a supported triple.

Then gate a change with all four:

```sh
bun run typecheck && bun run lint && bun run test && bun run fmt:check
```

Auto-fix with `bun run lint:fix && bun run fmt` — run `fmt` first, since formatting moves the line
breaks the spacing rules judge.

## Layout

```
packages/           workspace members; packages/tsconfig holds the shared TS base
lint/               the local oxlint rules, their fixtures and their tests
.oxlintrc.json      every rule, commented where the behaviour is surprising
AGENTS.md           conventions and invariants (CLAUDE.md is a symlink to it)
```

Every member with source needs a `test` script: the gate runs
`bun run --filter '*' --if-present test`, so a member without one is skipped in silence.

## What's enforced

Beyond oxlint's `correctness`, `suspicious` and `pedantic` categories and the `effecttsgo` preset:

- **Leaf imports only.** `effect/Effect`, not `effect`; `effect/unstable/schema/Schema`, not
  `effect/unstable/schema`.
- **`local/no-tag-access`** — never read `_tag`; use `Match.tag`/`Match.tags`/`Match.tagsExhaustive`
  or a library guard, so a new variant fails to compile instead of falling through.
- **`local/no-shadowed-error-field`** — no `name`/`stack` field on a `TaggedErrorClass`, which would
  overwrite what identifies the error as an error.
- **`local/statement-order`** — imports > type-defs > constants > functions > variables > modules >
  exports.
- **`local/padding-line-between-statements`** and **`local/expect-padding`** — vertical spacing, both
  auto-fixable.

Lint invocations pass `--deny-warnings`: the Effect preset ships most of its rules as warnings, and a
warning that cannot fail the gate is one nobody fixes.

## Writing a local rule

Rules live in `lint/`, are written with `effect-oxlint`, and are assembled by `Plugin.define` in
`lint/plugin.ts`:

```ts
export default Rule.define({
  name: 'no-tag-access',
  meta: Rule.meta({ type: 'problem', description: '…', messages: { noTagAccess: MESSAGE } }),
  create: function* () {
    const context = yield* RuleContext

    return {
      MemberExpression: (node) =>
        readsTheTag(node)
          ? context.report(Diagnostic.fromId({ node, messageId: 'noTagAccess' }))
          : Effect.void,
    }
  },
})
```

Prove it **rejects**, not that it passes clean code: add a deliberately malformed fixture under
`lint/fixtures/` and assert the reported lines in `lint/rules.test.ts`.

Because the plugin is TypeScript, oxlint has to run under Bun — every invocation is
`bunx --bun oxlint`. The `node_modules/.bin/oxlint` shim is `#!/usr/bin/env node`, which cannot
import a `.ts` plugin.
