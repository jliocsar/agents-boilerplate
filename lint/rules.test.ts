/**
 * The local rules, tested through oxlint — the runtime they actually run in,
 * including the JS-plugin bridge. (ESLint's `RuleTester` is also not an option:
 * typescript-eslint refuses to load against TypeScript 7.)
 *
 * Each case runs its fixture with only its own rule enabled — the fixtures are
 * deliberately malformed and would otherwise trip each other's rules.
 */

import { expect, test } from 'bun:test'

/** `--bun`: the plugin is TypeScript, which Node cannot import. */
const OXLINT = ['bunx', '--bun', 'oxlint']

/** Mirrors `.oxlintrc.json`, by hand: that file is JSONC and cannot be parsed. */
const PADDING_SPEC = [
  { blankLine: 'always', prev: '*', next: 'return' },
  { blankLine: 'always', prev: '*', next: 'block-like' },
  { blankLine: 'always', prev: 'block-like', next: '*' },
  { blankLine: 'always', prev: '*', next: ['function', 'class'] },
  { blankLine: 'always', prev: ['function', 'class'], next: '*' },
  { blankLine: 'always', prev: 'import', next: '*' },
  { blankLine: 'any', prev: 'import', next: 'import' },
  {
    blankLine: 'any',
    prev: ['singleline-const', 'singleline-let'],
    next: ['singleline-const', 'singleline-let'],
  },
]

/** Fixture file per rule, and the 1-indexed lines that must be reported. */
const CASES: { rule: string; lines: number[]; options?: unknown }[] = [
  { rule: 'no-tag-access', lines: [1, 2, 3, 4] },
  { rule: 'no-shadowed-error-field', lines: [1, 2] },
  { rule: 'expect-padding', lines: [2, 4] },
  { rule: 'padding-line-between-statements', lines: [2, 5], options: PADDING_SPEC },
  { rule: 'statement-order', lines: [5] },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** `Array.isArray` narrows `unknown` to `any[]`, putting an `any` back into every
 * element read. */
function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

/**
 * The `code` and line of each diagnostic in an oxlint JSON report, narrowed by
 * hand so a change in oxlint's output format reads as that, rather than as
 * `undefined` line numbers.
 */
function readDiagnostics(payload: unknown): { code: string; line: number }[] {
  if (!isRecord(payload) || !isUnknownArray(payload.diagnostics)) {
    throw new Error('oxlint did not return a JSON report with a `diagnostics` array.')
  }

  return payload.diagnostics.map((diagnostic) => {
    if (!isRecord(diagnostic) || typeof diagnostic.code !== 'string') {
      throw new Error('An oxlint diagnostic is missing its `code`.')
    }

    const [label] = isUnknownArray(diagnostic.labels) ? diagnostic.labels : []

    if (!isRecord(label) || !isRecord(label.span) || typeof label.span.line !== 'number') {
      throw new Error(`The oxlint diagnostic ${diagnostic.code} carries no source line.`)
    }

    return { code: diagnostic.code, line: label.span.line }
  })
}

/**
 * Lines reported by `rule` against its own fixture. Only `local(…)` diagnostics
 * count — oxlint keeps its default correctness rules on, and `no-unused-vars`
 * fires on every fixture.
 */
async function reportedLines(rule: string, options?: unknown): Promise<number[]> {
  const configPath = `tmp/oxlint-${rule}.json`
  const ruleSetting = options === undefined ? 'error' : ['error', options]

  await Bun.write(
    configPath,
    JSON.stringify({
      jsPlugins: ['../lint/plugin.ts'],
      rules: { [`local/${rule}`]: ruleSetting },
    }),
  )

  const result = await Bun.$`${OXLINT} -c ${configPath} -f json lint/fixtures/${rule}.ts`
    .nothrow()
    .quiet()

  return readDiagnostics(JSON.parse(result.stdout.toString()))
    .filter((diagnostic) => diagnostic.code === `local(${rule})`)
    .map((diagnostic) => diagnostic.line)
    .sort((left, right) => left - right)
}

for (const { rule, lines, options } of CASES) {
  test(`${rule} rejects its fixture`, async () => {
    const reported = await reportedLines(rule, options)

    expect(reported).toEqual(lines)
  })
}
