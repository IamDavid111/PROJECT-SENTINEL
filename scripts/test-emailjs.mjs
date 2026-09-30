import { existsSync, readFileSync } from 'node:fs'

const REQUIRED = [
  'EMAILJS_SERVICE_ID',
  'EMAILJS_TEMPLATE_ID',
  'EMAILJS_PUBLIC_KEY',
  'EMAILJS_PRIVATE_KEY',
]

const TO_EMAIL = 'rophitesting123@gmail.com'

function loadEnvFile(url) {
  if (!existsSync(url)) return {}
  const values = {}
  for (const line of readFileSync(url, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue
    let value = match[2].trim()
    const quoted = (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))
    if (quoted) value = value.slice(1, -1)
    values[match[1]] = value
  }
  return values
}

const root = new URL('../', import.meta.url)
const env = {
  ...loadEnvFile(new URL('supabase/functions/.env', root)),
  ...loadEnvFile(new URL('.env', root)),
  ...process.env,
}

const missing = REQUIRED.filter((key) => !env[key])
if (missing.length) {
  console.error('Missing environment variables:')
  for (const key of missing) console.error(`  - ${key}`)
  console.error('\nAdd them to .env at the repository root. That file is gitignored.')
  process.exit(1)
}

// A fragment, not a full document. The EmailJS template supplies the document.
const message = `
  <h2>Welcome!</h2>
  <p>Your account has been created.</p>
  <a href="https://example.com">Verify account</a>
`

const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    service_id: env.EMAILJS_SERVICE_ID,
    template_id: env.EMAILJS_TEMPLATE_ID,
    user_id: env.EMAILJS_PUBLIC_KEY,
    accessToken: env.EMAILJS_PRIVATE_KEY,
    template_params: {
      to_email: TO_EMAIL,
      to_name: 'Rophit Test',
      from_name: 'SentinelQHSE',
      subject: 'EmailJS HTML rendering test',
      message,
    },
  }),
})

const body = await response.text()
console.log(`status: ${response.status}`)
console.log(`body:   ${body || '(empty)'}`)

if (!response.ok) {
  console.error('\nIf the body mentions escaping or the private key, fix the template or the env vars.')
  process.exit(1)
}

console.log(`\nSent to ${TO_EMAIL}.`)
console.log('Expect rendered HTML, not literal <h2>/<p> tags.')
console.log('Literal tags mean the template still uses {{message}} and needs {{{message}}}.')
