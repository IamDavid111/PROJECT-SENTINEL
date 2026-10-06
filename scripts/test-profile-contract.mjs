import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const profilePage = source.slice(source.indexOf('function ProfileWorkspace'), source.indexOf('type RoleSummary'))

for (const field of ['identity.full_name', 'email', 'identity.employee_id', 'identity.department']) {
  assert.match(profilePage, new RegExp(`value=\\{${field.replace('.', '\\.')}\\} disabled`), `${field} should be read-only`)
}

assert.equal((profilePage.match(/Managed by your administrator\./g) || []).length, 4)
assert.match(profilePage, /onChange=\{\(event\) => updateField\('phone', event\.target\.value\)\}/)
assert.match(profilePage, /onChange=\{\(event\) => updateField\('emergency_contact', event\.target\.value\)\}/)
assert.match(profilePage, /update\(\{ phone: profile\.phone, emergency_contact: profile\.emergency_contact \}\)/)

for (const removedField of ['job_title', 'site_location', 'supervisor', 'certification_status']) {
  assert.ok(!profilePage.includes(removedField), `${removedField} should be removed from the profile page`)
}

console.log('PASS: identity fields are read-only and excluded from profile updates')
console.log('PASS: phone and emergency contact remain editable and are submitted')
console.log('PASS: removed profile fields are absent from page state and UI')