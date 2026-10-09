import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8').replace(/\r/g, '')
const names = [...src.matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1])
mkdirSync(new URL('../dist/', import.meta.url), { recursive: true })
writeFileSync(new URL('../dist/index.mjs', import.meta.url), src)
const cjs = src.replace(/^export (function|const) /gm, '$1 ') + `\nmodule.exports = { ${names.join(', ')} }\n`
writeFileSync(new URL('../dist/index.cjs', import.meta.url), "'use strict'\n" + cjs)
console.log(`built ${names.length} exports`)
