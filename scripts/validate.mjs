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
 *  8. src/ makes one network call: the IFSC lookup (src/ifsc.ts)
 *  9. no secrets in browser code: it never reads an env variable or names an
 *     API key, and .env is git-ignored
 * 10. no inline scripts, inline styles or HTML strings, so the CSP holds
 *
 * Every problem is printed with the entry id it belongs to. Exits non-zero if
 * any check fails.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
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

/**
 * 8: each of these files may call fetch() once; nothing else in src/ talks to
 * the network. Turant has no server, so there is no upload of any kind.
 */
const NETWORK_FILES = {
  'src/ifsc.ts': 'the IFSC lookup',
}
const NETWORK_API = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/g

/** Source files under src/ with the given extensions, as forward-slash paths. */
function sourceFiles(pattern) {
  return readdirSync(join(ROOT, 'src'), { recursive: true })
    .map((name) => `src/${String(name).replace(/\\/g, '/')}`)
    .filter((path) => pattern.test(path))
}

function validateNetworkCalls() {
  const before = problems.length

  for (const path of sourceFiles(/\.(?:ts|js|mjs)$/)) {
    const source = readFileSync(join(ROOT, path), 'utf8')
    const calls = (source.match(NETWORK_API) ?? []).filter(
      (name) => !(path in NETWORK_FILES) || name !== 'fetch',
    )
    if (calls.length > 0) {
      const allowed = Object.keys(NETWORK_FILES).join(' and ')
      fail(path, `network API not allowed outside ${allowed} (${calls.join(', ')})`)
    }
  }

  for (const [path, purpose] of Object.entries(NETWORK_FILES)) {
    const source = readFileSync(join(ROOT, path), 'utf8')
    if ((source.match(/\bfetch\(/g) ?? []).length > 1) {
      fail(path, `only ${purpose} may call fetch(), once`)
    }
  }

  if (problems.length === before) {
    console.log(`ok    network calls only from ${Object.keys(NETWORK_FILES).join(' and ')}`)
  }
}

/** 9: Turant has no server, so browser code must hold no secret at all. */
function validateSecrets() {
  const before = problems.length

  for (const path of sourceFiles(/\.(?:ts|js|mjs|json)$/)) {
    const source = readFileSync(join(ROOT, path), 'utf8')
    if (/import\.meta\.env|process\.env|VITE_|API_KEY/.test(source)) {
      fail(path, 'browser code must not read env variables or name an API key')
    }
  }

  const ignored = readFileSync(join(ROOT, '.gitignore'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
  if (!ignored.includes('.env') && !ignored.includes('.env*')) {
    fail('.gitignore', '.env must be ignored by git')
  }

  if (problems.length === before) console.log('ok    no secrets in browser code')
}

/**
 * 10: the Content-Security-Policy (vercel.json) allows only Turant's own
 * script and style files, so nothing may use inline scripts, inline styles,
 * event-handler attributes or HTML strings.
 */
const INLINE_IN_HTML = [
  [/<script(?![^>]*\bsrc=)[^>]*>/i, 'inline <script>'],
  [/<style\b/i, '<style> tag'],
  [/\sstyle\s*=/i, 'style attribute'],
  [/\son[a-z]+\s*=/i, 'event-handler attribute'],
  [/javascript:/i, 'javascript: URL'],
]
const INLINE_IN_SOURCE = [
  [/\b(?:innerHTML|outerHTML|insertAdjacentHTML)\b|document\.write/, 'HTML string'],
  [/\.style\b|cssText|setAttribute\(\s*['"](?:style|on[a-z]+)['"]/, 'inline style or handler'],
  [/<style\b|<script\b|\sstyle\s*=/i, 'inline style or script in a string'],
  [/\beval\(|new Function\(|javascript:/, 'code from a string'],
]

function validateNoInlineCode() {
  const before = problems.length
  const check = (path, rules) => {
    const source = readFileSync(join(ROOT, path), 'utf8')
    for (const [pattern, what] of rules) {
      if (pattern.test(source)) fail(path, `${what} is blocked by the Content-Security-Policy`)
    }
  }
  check('index.html', INLINE_IN_HTML)
  for (const path of sourceFiles(/\.(?:ts|js|mjs)$/)) check(path, INLINE_IN_SOURCE)
  if (problems.length === before) console.log('ok    no inline scripts or styles (CSP holds)')
}

validateAgainstSchema('data/actions.json', 'data/schema.json', Ajv2020)
validateAgainstSchema('data/grievance.json', 'data/schemas/grievance.schema.json', Ajv)
validateActions()
validateTranslations()
validateNoRuntimeDependencies()
validateNoExternalAssets()
validateNetworkCalls()
validateSecrets()
validateNoInlineCode()

if (problems.length > 0) {
  console.error(`\nvalidate: ${problems.length} problem(s)`)
  for (const problem of problems) console.error(`  ${problem.id}: ${problem.message}`)
  process.exitCode = 1
} else {
  console.log('\nvalidate: all checks passed')
}
