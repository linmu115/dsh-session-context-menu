import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = await readFile(resolve(root, 'src/client.js'), 'utf8')
const body = source
  .replace('export const inject =', 'const inject =')
  .replace('export function apply', 'function apply')
  .replace(/\nexport \{ createBridge \}\s*$/u, '\n')

const bundled = [
  'window.__ModuleLoader__.load({ id: "dsh-session-context-menu", factory: (require) => {',
  'var module = { exports: {} }; var exports = module.exports;',
  'Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
  body.trimEnd(),
  'exports.apply = apply;',
  'exports.inject = inject;',
  'exports.createBridge = createBridge;',
  'return module.exports; } });',
  '',
].join('\n')

await writeFile(resolve(root, 'lib/client.js'), bundled, 'utf8')
await writeFile(resolve(root, 'lib/index.js'), await readFile(resolve(root, 'src/index.js'), 'utf8'), 'utf8')

