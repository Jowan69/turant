#!/usr/bin/env node
/**
 * Turant data and policy checks. Run with `npm run validate`.
 *
 *  1. data/actions.json  matches data/schemas/actions.schema.json
 *  2. data/grievance.json matches data/schemas/grievance.schema.json
 *  3. every UI string exists, non-empty, in all of src/i18n/<lang>.json
 *  4. package.json declares no runtime dependencies
 *  5. index.html loads no external script, stylesheet, font or CDN
 *
 * Exits non-zero on the first failing category, printing every problem found.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LANGS = ['en', 'hi', 'ml']

const problems = []
const fail = (message) => problems.push(message)
const readJson = (relativePath) => JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8'))

/** 1 & 2: data files must match their JSON Schema. */
function validateDataFile(dataPath, schemaPath) {
  let validate
  try {
    const ajv = new Ajv({ allErrors: true, strict: false })
    validate = ajv.compile(readJson(schemaPath))
  } catch (error) {
    fail(`${schemaPath}: cannot compile schema (${error.message})`)
    return
  }

  let data
  try {
    data = readJson(dataPath)
  } catch (error) {
    fail(`${dataPath}: cannot read or parse (${error.message})`)
    return
  }

  if (validate(data)) {
    console.log(`ok    ${dataPath}`)
    return
  }

  fail(`${dataPath}: does not match ${schemaPath}`)
  for (const error of validate.errors ?? []) {
    const where = error.instancePath || '/'
    fail(`        ${where} ${error.message}`)
  }
}

/** 3: all languages share one key set, with no empty strings. */
function validateTranslations() {
  const dicts = {}
  for (const lang of LANGS) {
    try {
      dicts[lang] = readJson(`src/i18n/${lang}.json`)
    } catch (error) {
      fail(`src/i18n/${lang}.json: cannot read or parse (${error.message})`)
    }
  }

  const keys = Object.keys(dicts.en ?? {}).sort()
  if (keys.length === 0) fail('src/i18n/en.json: no UI strings found')

  for (const lang of LANGS) {
    const dict = dicts[lang]
    if (!dict) continue

    const missing = keys.filter((key) => !(key in dict))
    const extra = Object.keys(dict)
      .filter((key) => !keys.includes(key))
      .sort()
    if (missing.length > 0) fail(`src/i18n/${lang}.json: missing keys ${missing.join(', ')}`)
    if (extra.length > 0) fail(`src/i18n/${lang}.json: unexpected keys ${extra.join(', ')}`)

    for (const [key, value] of Object.entries(dict)) {
      if (typeof value !== 'string' || value.trim() === '') {
        fail(`src/i18n/${lang}.json: "${key}" must be a non-empty string`)
      }
    }
  }

  if (Object.keys(dicts).length === LANGS.length && !problems.some((p) => p.startsWith('src/i18n/'))) {
    console.log(`ok    src/i18n/{${LANGS.join(',')}}.json`)
  }
}

/** 4: Turant ships with zero runtime dependencies. */
function validateNoRuntimeDependencies() {
  const pkg = readJson('package.json')
  const runtime = Object.keys(pkg.dependencies ?? {})
  if (runtime.length > 0) {
    fail(`package.json: runtime dependencies are not allowed (${runtime.join(', ')})`)
    return
  }
  console.log('ok    package.json has no runtime dependencies')
}

/** 5: no third-party scripts, styles, fonts or CDNs in the shell. */
function validateNoExternalAssets() {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
  const external = html.match(/(?:src|href)\s*=\s*["'](?:https?:)?\/\//gi)
  if (external) {
    fail(`index.html: external assets are not allowed (${external.join(', ')})`)
    return
  }
  console.log('ok    index.html loads no external assets')
}

validateDataFile('data/actions.json', 'data/schemas/actions.schema.json')
validateDataFile('data/grievance.json', 'data/schemas/grievance.schema.json')
validateTranslations()
validateNoRuntimeDependencies()
validateNoExternalAssets()

if (problems.length > 0) {
  console.error(`\nvalidate: ${problems.length} problem(s)`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exitCode = 1
} else {
  console.log('\nvalidate: all checks passed')
}