import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('..', import.meta.url))
const brandAdapter = 'src/modules/player/infrastructure/engineAdapter.ts'
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(resolve(directory, entry.name)) : [resolve(directory, entry.name)])
}
function executableSources(path) {
  const source = readFileSync(path, 'utf8')
  if (path.endsWith('.html')) return [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map(match => match[1])
  return [source]
}
function violations(source, name) {
  const result = []
  const ast = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const engineModule = value => value === '@notrac/mage' || /(?:^|\/)mage-engine(?:\.min)?\.js(?:\?.*)?$/.test(value)
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && engineModule(node.moduleSpecifier.text)) {
      const clause = node.importClause
      const allTypes = clause?.isTypeOnly || (!clause?.name && clause?.namedBindings && ts.isNamedImports(clause.namedBindings)
        && clause.namedBindings.elements.every(item => item.isTypeOnly))
      if (!allTypes && name !== brandAdapter) result.push('runtime engine import')
    }
    if (ts.isCallExpression(node)) {
      const expression = node.expression
      if (expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])
        && engineModule(node.arguments[0].text) && name !== brandAdapter) result.push('dynamic engine import')
      const call = ts.isIdentifier(expression) ? expression.text : ts.isPropertyAccessExpression(expression) ? expression.name.text : ''
      if (['eval', 'Function'].includes(call)) result.push('dynamic source evaluation')
      if (['initMAGE', 'loadPreset'].includes(call) && name !== brandAdapter) result.push('parent renderer invocation')
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Function') result.push('dynamic source constructor')
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return result
}

test('parent application and browser harnesses do not compile scene source', () => {
  const failures = []
  for (const path of [...files(resolve(root, 'src')), ...files(resolve(root, 'scripts'))]) {
    const name = relative(root, path).replaceAll('\\', '/')
    if (!/\.(?:[cm]?js|tsx?|html)$/.test(name) || /\.(test|spec)\.[^.]+$/.test(name) || name.endsWith('.d.ts')
      || name.startsWith('src/isolated-renderer/')) continue
    for (const source of executableSources(path)) for (const reason of violations(source, name)) failures.push(`${name}: ${reason}`)
  }
  assert.deepEqual(failures, [], 'Only the guarded platform-brand adapter and isolated child may import the renderer. Audio-only modules are permitted.')
})

test('architecture guard detects runtime imports, evaluation and direct renderer calls while permitting type-only imports', () => {
  assert.deepEqual(violations("import type { MAGEEngineAPI } from '@notrac/mage'", 'src/example.ts'), [])
  assert.deepEqual(violations("import { type MAGEEngineAPI } from '@notrac/mage'", 'src/example.ts'), [])
  assert.deepEqual(violations("import { AudioAnalysisSession } from '@notrac/mage/audio-analysis'", 'src/example.ts'), [])
  assert.equal(violations("import { initMAGE } from '@notrac/mage'; initMAGE();", 'src/example.ts').length, 2)
  assert.equal(violations("await import('@notrac/mage'); engine.loadPreset(source);", 'scripts/example.mjs').length, 2)
  assert.equal(violations('eval(source); new Function(source);', 'src/example.ts').length, 2)
})
