# Decision log

What this repo already knows about its own toolchain: what was tried, what was measured, what was
decided and why. Read it before changing a pin, a script or the shared config, so you do not
re-derive a fact somebody already paid for. Add to it whenever you measure something, settle a
design question, or lose an afternoon to a trap — one fact per bullet, the fact first and its
consequence second, and say plainly when something was measured rather than assumed. A fact that
cannot be stated without naming a file, symbol or line is not worth keeping; drop it.

The lint rules themselves are a separate package with a separate log. Everything about writing an
oxlint rule — the parser, the plugin API, type resolution without a type checker, why each rule
exists — lives there, not here.

## The toolchain and its traps

- The Effect rules arrive as a preset that turns type-aware mode on itself, so no type-aware flag
  appears on any invocation. The preset also ships most of those rules as warnings, which is why
  every invocation denies warnings: a warning that cannot fail the gate is one nobody fixes.
  Downgrade an individual rule rather than dropping the flag.
- The Effect toolchain patches the linter and compiler binaries inside the dependency tree as an
  install step. Without it the Effect rules do not run at all, and it re-runs on every install, so
  it cannot be simplified away. The same step validates that the linter, its type-aware bridge and
  the Effect toolchain are a supported triple — those three bump together or not at all.
- TypeScript is pinned exactly, with no caret range: the Effect toolchain ships prebuilt artifacts
  for specific TypeScript builds and fails outright with a missing-packaged-artifact error against
  any other one (measured). It is bumped with the Effect toolchain, or not at all.
- Effect diagnostics are reported by the linter only. The language-service plugin's own diagnostics
  are turned off in the shared TypeScript base, or every Effect finding appears twice in an editor.
- typescript-eslint refuses to load against TypeScript 7, so ESLint and its rule tester are
  unavailable to a repo pinned there. That is not a preference between linters; it is why the lint
  stack is oxc-based.
- The formatter is run before the lint autofix, not after: formatting moves line breaks, and the
  vertical-spacing rules judge the result. Reversing the order leaves the gate failing on spacing
  the formatter has just changed.
- This repo carries no product code, and the linter exits non-zero when it matches no files at all,
  so every lint invocation passes the flag that permits an unmatched pattern. Without it the gate
  fails on an empty template — which is exactly the state a boilerplate ships in.

## Consuming the lint plugin

- The linter imports its JS plugins with whatever runtime is executing it, so a plugin distributed
  as TypeScript source only loads when the linter itself is run by Bun; under Node the import dies
  with `ERR_UNKNOWN_FILE_EXTENSION` (measured under Node 20 LTS, where unflagged type-stripping does
  not yet exist). The plugin consumed here ships compiled ESM instead, which is what lets every lint
  invocation be a plain one with no runtime wrapper.
- The linter's plugin list resolves a bare package specifier, but `extends` does not — an extended
  config is resolved relative to the config file naming it (measured). The plugin is therefore named
  by its bare specifier while its shipped preset is reached through its path inside the dependency
  directory. The two look inconsistent and are.
- A plugin names itself independently of the package that ships it, so publishing under a scope
  leaves every rule reference unchanged (measured against the published package). The scope appears
  where the package is installed and loaded, and nowhere else.
- A preset that omits its `plugins` key re-enables the linter's own default plugin set on top of
  whatever extends it, failing the gate on rules nobody chose (measured: 7 reports). Both the
  extended presets and this repo's config list their plugins explicitly for that reason.
- The config format is JSONC, so the config file is the one place in this repo where a comment is
  legal — and anything reading it back needs a JSONC parser rather than a plain JSON one (measured).
- A dependency resolved from a local checkout is copied at install time, not linked live. Edits to
  the checkout are invisible here until the install is redone, so a stale copy can be linted against
  for hours while its source says otherwise (measured). Reinstalling to refresh it also reverts the
  patched linter binaries, and the patcher then declines to re-patch because its backups still
  exist — restore first, then patch again.
- The linter discovers configuration files nested anywhere beneath the invocation, and ignore
  patterns do not stop it: they govern which files are linted, not which configs are read
  (measured). A dependency resolved from a local checkout rather than the registry exposes that
  checkout's own development config inside the dependency directory, and loading it registers the
  same plugin a second time under a different specifier, which the linter rejects as a name
  collision. A published package carries no development config, so consuming the registry version
  avoids this entirely; a local link needs nested discovery disabled on every invocation.
- The rule-authoring library is a dependency of the plugin, not of anything here. Once the rules
  moved out, nothing in this repo imported it, and a direct dependency nothing imports is one nobody
  will remember to remove.

## Layout and the gate

- Shared code is reached by package specifier, never by a relative path across workspace members. In
  a flat member layout a sibling climb spells `../../other`, which names no directory and so cannot
  be distinguished by any lint rule; nothing enforces this and review has to catch it. If the import
  you want is not exported, export it.
- A workspace member without a `test` script is skipped silently by the filtered run rather than
  reported, so a member whose tests quietly stopped existing looks exactly like a passing one. Every
  member carrying source needs the script.
- A member that ships only a config file — a shared TypeScript base, for instance — carries no
  scripts at all, and that is the honest shape: there is nothing runnable in it to gate.
- A gate that reports green while the only member carrying tests is one this repo does not own tests
  nothing about this repo. When the vendored copy of the lint plugin was left behind after the rules
  moved to their own repository, the gate went on running that copy's suite — a full green run whose
  every assertion belonged elsewhere.
