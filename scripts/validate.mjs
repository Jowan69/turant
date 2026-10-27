#!/usr/bin/env node
/**
 * Turant data and policy checks. Run with `npm run validate`.
 *
 *  1. data/actions.json matches data/schema.json (JSON Schema 2020-12)
 *  2. ids in data/actions.json are unique
 *  3. every action has an evidence/<id>.png capture
 *  4. data/grievance.json matches data/schemas/grievance.schema.json
 *  5. every UI string exists, non-empty, in all of src/i18n/<lang>.json
 *  6. package.json declares no runtime dependencies
 *  7. index.html loads no external script, stylesheet, font or CDN
 *
 * Every problem is printed with the entry id it belongs to. Exits non-zero if
 * any check fails.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'
import Ajv2020 from 'ajv/dist/2020.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LANGS = ['en', 'hi', 'ml']

/** Problems are collected as { id, message } so every line names its entry. */
const problems = []
const fail = (id, message) => problems.push({ id, message })
const readJson = (relativePath) => JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8'))

/** The id of the entry an Ajv instancePath points into, for readable errors. */
function idForInstancePath(data, instancePath) {
  const match = /^\/(\d+)/.exec(instancePath ?? '')
  if (!match || !Array.isArray(data)) return '<actions>'
  const entry = data[Number(match[1])]
  return typeof entry?.id === 'string' ? entry.id : `#${match[1]}`
}

function loadJson(relativePath) {
  try {
    return readJson(relativePath)
  } catch (error) {
    fail('<file>', `${relativePath}: cannot read or parse (${error.message})`)
    return undefined
  }
}

/** 1 & 4: a data file must match its JSON Schema. */
function validateAgainstSchema(dataPath, schemaPath, AjvClass) {
  const schema = loadJson(schemaPath)
  const data = loadJson(dataPath)
  if (schema === undefined || data === undefined) return

  let validate
  try {
    validate = new AjvClass({ allErrors: true, strict: false }).compile(schema)
  } catch (error) {
    fail('<schema>', `${schemaPath}: cannot compile schema (${error.message})`)
    return
  }

  if (validate(data)) {
    console.log(`ok    ${dataPath} matches ${schemaPath}`)
    return
  }

  for (const error of validate.errors ?? []) {
    const where = error.instancePath || '/'
    const id = idForInstancePath(data, error.instancePath)
    const property = error.params?.missingProperty ? ` (${error.params.missingProperty})` : ''
    fail(id, `${dataPath}${where}: ${error.message}${property}`)
  }
}

/** 2 & 3: actions need unique ids and a screenshot named after each id. */
function validateActions() {
  let actions
  try {
    actions = readJson('data/actions.json')
  } catch (error) {
    fail('<file>', `data/actions.json: cannot read or parse (${error.message})`)
    return
  }
  if (!Array.isArray(actions)) return

  const before = problems.length
  const seen = new Map()
  for (const [index, action] of actions.entries()) {
    const id = typeof action?.id === 'string' ? action.id : `#${index}`
    seen.set(id, (seen.get(id) ?? 0) + 1)
  }

  for (const [id, count] of seen) {
    if (count > 1) fail(id, `id is used ${count} times; ids must be unique`)
    if (!existsSync(join(ROOT, 'evidence', `${id}.png`))) {
      fail(id, `missing evidence/${id}.png`)
    }
  }

  if (problems.length === before && seen.size > 0) {
    console.log(`ok    evidence/<id>.png found for ${seen.size} actions`)
  }
}

/** 5: all languages share one key set, with no empty strings. */
function validateTranslations() {
  const before = problems.length
  const dicts = {}
  for (const lang of LANGS) {
    try {
      dicts[lang] = readJson(`src/i18n/${lang}.json`)
    } catch (error) {
      fail(`<${lang}>`, `src/i18n/${lang}.json: cannot read or parse (${error.message})`)
    }
  }

  const keys = Object.keys(dicts.en ?? {}).sort()
  if (keys.length === 0) fail('<en>', 'src/i18n/en.json: no UI strings found')

  for (const lang of LANGS) {
    const dict = dicts[lang]
    if (!dict) continue

    const missing = keys.filter((key) => !(key in dict))
    const extra = Object.keys(dict)
      .filter((key) => !keys.includes(key))
      .sort()
    if (missing.length > 0) fail(lang, `src/i18n/${lang}.json: missing keys ${missing.join(', ')}`)
    if (extra.length > 0) fail(lang, `src/i18n/${lang}.json: unexpected keys ${extra.join(', ')}`)

    for (const [key, value] of Object.entries(dict)) {
      if (typeof value !== 'string' || value.trim() === '') {
        fail(lang, `src/i18n/${lang}.json: "${key}" must be a non-empty string`)
      }
    }
  }

  if (problems.length === before) {
    console.log(`ok    src/i18n/{${LANGS.join(',')}}.json`)
  }
}

/** 6: Turant ships with zero runtime dependencies. */
function validateNoRuntimeDependencies() {
  const pkg = readJson('package.json')
  const runtime = Object.keys(pkg.dependencies ?? {})
  if (runtime.length > 0) {
    fail('package.json', `runtime dependencies are not allowed (${runtime.join(', ')})`)
    return
  }
  console.log('ok    package.json has no runtime dependencies')
}

/** 7: no third-party scripts, styles, fonts or CDNs in the shell. */
function validateNoExternalAssets() {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
  const external = html.match(/(?:src|href)\s*=\s*["'](?:https?:)?\/\//gi)
  if (external) {
    fail('index.html', `external assets are not allowed (${external.join(', ')})`)
    return
  }
  console.log('ok    index.html loads no external assets')
}

validateAgainstSchema('data/actions.json', 'data/schema.json', Ajv2020)
validateAgainstSchema('data/grievance.json', 'data/schemas/grievance.schema.json', Ajv)
validateActions()
validateTranslations()
validateNoRuntimeDependencies()
validateNoExternalAssets()

if (problems.length > 0) {
  console.error(`\nvalidate: ${problems.length} problem(s)`)
  for (const problem of problems) console.error(`  ${problem.id}: ${problem.message}`)
  process.exitCode = 1
} else {
  console.log('\nvalidate: all checks passed')
}
