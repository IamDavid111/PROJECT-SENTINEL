import { createHash } from 'node:crypto'
import { readFile, readFile as readTextFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { Client as PostgresClient } from 'pg'

const demoCompanyName = 'Sentinel Energy & Industrial Services Ltd'
const demoCompanyCode = 'SENTINEL-DEMO'
const defaultDemoOrganizationId = uuidFor('sentinelqhsedemo', 'organization')
const reportStart = Date.parse('2023-09-29T00:00:00.000Z')
const reportEnd = Date.parse('2026-09-29T23:59:59.000Z')
const demoIncidentCount = 1000
const demoDraftCount = 15
const seedNamespace = 'sentinelqhsedemo-v1'

const departments = [
  'HSE', 'Operations', 'Maintenance', 'Engineering', 'Procurement',
  'Human Resources', 'Finance', 'Security', 'Logistics', 'Administration',
]

const shifts = [
  { id: 'day-shift', name: 'Day', start: '07:00', end: '19:00', active: true },
  { id: 'afternoon-shift', name: 'Afternoon', start: '15:00', end: '23:00', active: true },
  { id: 'night-shift', name: 'Night', start: '19:00', end: '07:00', active: true },
]

const categories = [
  'Near Miss', 'Unsafe Condition', 'Unsafe Act', 'Environmental Incident',
  'Slip/Trip/Fall', 'Injury / Illness', 'Vehicle / Transportation Incident',
  'Fire / Explosion', 'Property / Equipment Damage', 'Process Safety Incident',
  'Security Incident', 'Occupational Health', 'Chemical / Hazardous Substance',
  'Electrical Incident', 'Lifting / Dropped Object', 'Working at Height',
]

const severities = ['Low', 'Medium', 'High', 'Critical']
const reportTypes = ['near_miss', 'unsafe_condition', 'unsafe_act', 'environmental_incident', 'incident']

const sites = [
  { name: 'Lagos Head Office', code: 'DEMO-LAGOS-HO', address: 'Demo location, Lagos, Nigeria', latitude: 6.5244, longitude: 3.3792 },
  { name: 'Port Harcourt Operations Base', code: 'DEMO-PH-BASE', address: 'Demo location, Port Harcourt, Nigeria', latitude: 4.8156, longitude: 7.0498 },
  { name: 'Onne Logistics Base', code: 'DEMO-ONNE-LOG', address: 'Demo location, Onne, Nigeria', latitude: 4.70, longitude: 7.15 },
  { name: 'Warri Field Operations', code: 'DEMO-WARRI-FLD', address: 'Demo location, Warri, Nigeria', latitude: 5.516, longitude: 5.75 },
  { name: 'Bonny Operations Site', code: 'DEMO-BONNY-OPS', address: 'Demo location, Bonny, Nigeria', latitude: 4.45, longitude: 7.17 },
  { name: 'Yenagoa Field Office', code: 'DEMO-YENAGOA', address: 'Demo location, Yenagoa, Nigeria', latitude: 4.92, longitude: 6.26 },
  { name: 'Escravos Operations Site', code: 'DEMO-ESCRAVOS', address: 'Demo location, Escravos, Nigeria', latitude: 5.54, longitude: 5.19 },
  { name: 'Calabar Support Base', code: 'DEMO-CALABAR', address: 'Demo location, Calabar, Nigeria', latitude: 4.95, longitude: 8.32 },
]

const users = [
  ['Chinedu Okafor', 'Organization Administrator', 'Administration', 'Operations Administrator'],
  ['Adebayo Adeyemi', 'QHSE Manager', 'HSE', 'QHSE Manager'],
  ['Chiamaka Nwosu', 'Safety Officer / HSE Officer', 'HSE', 'Environmental Officer'],
  ['Ibrahim Musa', 'Site Supervisor', 'Operations', 'Operations Supervisor'],
  ['Ngozi Eze', 'Auditor', 'HSE', 'Internal Auditor'],
  ['Emeka Obi', 'Maintenance Engineer', 'Maintenance', 'Maintenance Engineer'],
  ['Fatima Bello', 'Field Worker', 'Operations', 'Field Technician'],
  ['Tunde Adebayo', 'Safety Officer / HSE Officer', 'HSE', 'Safety Officer'],
  ['Blessing Ebi', 'Contractor', 'Engineering', 'Electrical Contractor'],
  ['Daniel Okoro', 'Field Worker', 'Engineering', 'Mechanical Technician'],
  ['Esther Williams', 'Executive / Management', 'Administration', 'Operations Director'],
  ['Samuel Nwachukwu', 'Field Worker', 'Maintenance', 'Maintenance Technician'],
  ['Halima Abdullahi', 'Field Worker', 'Logistics', 'Logistics Coordinator'],
  ['Kelechi Umeh', 'Site Supervisor', 'Engineering', 'Engineering Supervisor'],
  ['David Alabi', 'Field Worker', 'Security', 'Security Officer'],
  ['Amarachi Okeke', 'Field Worker', 'Procurement', 'Procurement Officer'],
  ['Yusuf Ibrahim', 'Maintenance Engineer', 'Maintenance', 'Instrument Technician'],
  ['Mercy Johnson', 'Organization Administrator', 'Human Resources', 'HR Administrator'],
  ['Kingsley Eze', 'Field Worker', 'Finance', 'Finance Officer'],
  ['Favour Odu', 'Field Worker', 'Operations', 'Process Operator'],
].map(([fullName, role, department, jobTitle], index) => ({
  id: uuidFor(seedNamespace, `auth-user-${index + 1}`),
  fullName,
  email: `${slug(fullName)}.demo@example.com`,
  role,
  department,
  jobTitle,
  employeeId: `DEMO-${String(index + 1).padStart(3, '0')}`,
  siteIndex: index % sites.length,
  employmentType: role === 'Contractor' ? 'contractor' : 'employee',
}))

const incidentScenarios = [
  { category: 'Near Miss', reportType: 'near_miss', title: 'Forklift stopped before entering a pedestrian crossing', description: 'A banksman signalled the forklift operator to stop when a worker approached the marked crossing. No contact occurred. The crossing was temporarily held clear while the team reviewed the movement plan.', weight: 21 },
  { category: 'Near Miss', reportType: 'near_miss', title: 'Loose load shifted during a controlled lift', description: 'A timber spacer moved as the load was raised a short distance. The operator lowered the load safely, and the lifting team reset the spacers before resuming under the approved lift plan.', weight: 12 },
  { category: 'Unsafe Condition', reportType: 'unsafe_condition', title: 'Damaged electrical cable identified before equipment use', description: 'A pre-use inspection found worn insulation near a portable tool connection in the workshop. The tool was isolated and tagged out pending replacement of the cable assembly.', weight: 16 },
  { category: 'Unsafe Condition', reportType: 'unsafe_condition', title: 'Emergency exit partially obstructed by stored materials', description: 'Materials were found reducing the clear width of an emergency exit route. The area supervisor arranged immediate removal and reminded the shift team of the egress clearance requirement.', weight: 12 },
  { category: 'Unsafe Act', reportType: 'unsafe_act', title: 'Eye protection not worn during grinding preparation', description: 'A technician began preparing a grinding task without wearing the required eye protection. The work was paused before tool start, and the supervisor completed a task-specific PPE reminder.', weight: 14 },
  { category: 'Unsafe Act', reportType: 'unsafe_act', title: 'Vehicle reversed without a designated banksman', description: 'A delivery vehicle began reversing in a congested yard without a designated banksman. The driver stopped on request, and a spotter was assigned before the manoeuvre continued.', weight: 10 },
  { category: 'Environmental Incident', reportType: 'environmental_incident', title: 'Small diesel spill contained near generator area', description: 'A minor fuel leak was observed beneath a generator during routine rounds. Absorbent material was applied, contaminated waste was segregated, and the equipment was isolated for inspection.', weight: 9 },
  { category: 'Chemical / Hazardous Substance', reportType: 'environmental_incident', title: 'Chemical container found without secondary label', description: 'A decanted container in the maintenance store did not show the secondary label required by the site procedure. The container was isolated until its contents and handling information were verified.', weight: 4 },
  { category: 'Injury / Illness', reportType: 'incident', title: 'Worker sustained a minor hand injury during maintenance', description: 'A worker reported a small cut while handling a component after maintenance work. First aid was provided, the task was paused, and the work team reviewed glove selection and handling technique.', weight: 6 },
  { category: 'Slip/Trip/Fall', reportType: 'incident', title: 'Worker slipped on a wet surface near the workshop', description: 'A worker lost footing on a wet patch near the workshop entrance and reported discomfort without loss of consciousness. The area was cordoned, dried, and inspected for the source of water.', weight: 5 },
  { category: 'Vehicle / Transportation Incident', reportType: 'incident', title: 'Service vehicle contacted a low barrier while manoeuvring', description: 'A service vehicle made low-speed contact with a site barrier while manoeuvring in a restricted parking area. No injury was reported. The vehicle and barrier were inspected and the route reviewed.', weight: 4 },
  { category: 'Property / Equipment Damage', reportType: 'incident', title: 'Hydraulic hose leak identified during equipment inspection', description: 'A hydraulic hose showed fluid seepage during a scheduled equipment check. The unit was shut down, the affected area was contained, and a replacement hose was requested before return to service.', weight: 4 },
  { category: 'Fire / Explosion', reportType: 'incident', title: 'Fire extinguisher access found obstructed', description: 'Stored items partially obstructed access to a fire extinguisher in the utility area. The obstruction was removed, the extinguisher was checked, and the location was raised at the shift handover.', weight: 2 },
  { category: 'Process Safety Incident', reportType: 'incident', title: 'Gas detector alarm activated during inspection', description: 'A portable gas detector alarmed during a routine inspection near process equipment. The team withdrew to the designated safe area, notified the control room, and followed the site response procedure.', weight: 2 },
  { category: 'Lifting / Dropped Object', reportType: 'incident', title: 'Unsecured material observed at elevated work area', description: 'A loose item was identified on an elevated platform above a controlled work area. Access below was restricted while the item was secured and the work-at-height equipment was checked.', weight: 2 },
  { category: 'Security Incident', reportType: 'incident', title: 'Unescorted visitor approached a restricted work area', description: 'A visitor was observed near a restricted work zone without an escort. Security redirected the visitor to reception and confirmed the visitor management process with the host team.', weight: 1 },
]

const actionPlans = [
  'Deliver a task-specific toolbox talk and record attendance.',
  'Replace or repair the affected equipment before return to service.',
  'Improve housekeeping and add a documented end-of-shift inspection.',
  'Install clear warning signage and verify it during routine rounds.',
  'Review the risk assessment and update the safe work procedure.',
  'Provide a focused refresher on PPE selection and use.',
  'Restrict access until the hazard has been isolated and verified.',
  'Add a pre-use check for the identified equipment condition.',
]

function slug(value) {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '')
}

function uuidFor(namespace, value) {
  const bytes = createHash('sha256').update(`${namespace}:${value}`).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function seededRandom(seed) {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let next = value
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

function chooseWeighted(random, entries) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0)
  let value = random() * total
  for (const entry of entries) {
    value -= entry.weight
    if (value <= 0) return entry
  }
  return entries.at(-1)
}

function sql(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object') return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`
  return `'${String(value).replaceAll("'", "''")}'`
}

function makeRecords(demoUsers, demoOrganizationId) {
  const random = seededRandom(20260929)
  const rows = []
  const workflowStatuses = ['investigation', 'corrective_action', 'pending_verification', 'closed']
  const effectiveReportEnd = Math.min(reportEnd, Date.now()) - 3 * 60 * 60 * 1000
  const span = effectiveReportEnd - reportStart
  const dayMs = 24 * 60 * 60 * 1000

  for (let index = 0; index < demoIncidentCount; index += 1) {
    const scenario = chooseWeighted(random, incidentScenarios)
    const reporter = demoUsers[Math.floor(random() * demoUsers.length)]
    const site = sites[Math.floor(random() * sites.length)]
    const baseReportedAt = reportStart + Math.floor((index / (demoIncidentCount - 1)) * span)
    const isRecent = baseReportedAt > effectiveReportEnd - 16 * 24 * 60 * 60 * 1000
    const status = chooseWeighted(random, isRecent ? [
      { value: 'submitted', weight: 45 },
      { value: 'under_review', weight: 35 },
      { value: 'investigation', weight: 20 },
    ] : [
      { value: 'closed', weight: 55 },
      { value: 'submitted', weight: 10 },
      { value: 'under_review', weight: 10 },
      { value: 'investigation', weight: 10 },
      { value: 'corrective_action', weight: 10 },
      { value: 'pending_verification', weight: 5 },
    ]).value
    const severity = chooseWeighted(random, [
      { value: 'Low', weight: 60 },
      { value: 'Medium', weight: 30 },
      { value: 'High', weight: 9 },
      { value: 'Critical', weight: 1 },
    ]).value
    const incidentOffset = Math.floor(random() * 72 * 60 * 60 * 1000)
    const occurredAtMs = Math.max(reportStart, baseReportedAt - incidentOffset)
    const occurrenceDate = new Date(occurredAtMs)
    const reportedAt = new Date(Math.min(effectiveReportEnd, Math.max(occurredAtMs, baseReportedAt + Math.floor(random() * 4 * 60 * 60 * 1000))))
    const contractorInvolved = random() < 0.22
    const shift = shifts[Math.floor(random() * shifts.length)]
    const department = departments[Math.floor(random() * departments.length)]
    const facilityName = `${site.name.replace(' Site', '').replace(' Base', '')} - Main Operations Area`
    const titleSuffix = ['during routine rounds', 'at shift handover', 'during planned maintenance', 'before equipment start-up', 'during materials handling', 'while preparing the work area'][Math.floor(random() * 6)]
    const detailSuffix = [
      'The supervisor verified the immediate control and briefed the incoming shift.',
      'The team recorded the condition and agreed follow-up actions before restarting work.',
      'The area remained controlled until the responsible department completed its check.',
      'The reporter notified the site contact and retained the relevant inspection record.',
      'The response was reviewed at the next toolbox talk to reduce repeat exposure.',
    ][Math.floor(random() * 5)]
    const seedId = index + 1
    const reportedBy = reporter.id
    const incidentId = uuidFor(seedNamespace, `incident-${String(seedId).padStart(5, '0')}`)
    const referenceNumber = `DEMO-INC-${String(seedId).padStart(6, '0')}`
    const location = `${facilityName}, ${site.name}`
    const incidentTimestamp = occurrenceDate.toISOString()
    const reportedTimestamp = reportedAt.toISOString()
    const createdTimestamp = reportedTimestamp
    const investigationId = uuidFor(seedNamespace, `investigation-${seedId}`)
    const workflowStatus = status === 'investigation' ? 'in_progress'
      : status === 'under_review' ? 'pending_review'
        : workflowStatuses.includes(status) ? 'completed' : null
    const investigation = workflowStatus ? {
      id: investigationId,
      organization_id: demoOrganizationId,
      incident_id: incidentId,
      status: workflowStatus,
      assigned_investigator_id: demoUsers[1 + (seedId % (demoUsers.length - 1))].id,
      investigation_lead_id: demoUsers[1].id,
      assigned_by: demoUsers[0].id,
      assigned_at: new Date(reportedAt.getTime() + 60 * 60 * 1000).toISOString(),
      started_at: new Date(reportedAt.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      target_completion_date: new Date(reportedAt.getTime() + 14 * dayMs).toISOString().slice(0, 10),
      completed_at: workflowStatus === 'completed' ? new Date(reportedAt.getTime() + 7 * dayMs).toISOString() : null,
      investigation_summary: `The review examined the reported ${scenario.category.toLowerCase()} and confirmed the event timeline with the site team.`,
      findings_summary: `The primary contributing factor was reviewed in relation to ${department.toLowerCase()} controls and local work conditions.`,
      conclusions: workflowStatus === 'completed' ? 'Immediate controls were verified and follow-up actions were assigned to the responsible role.' : null,
      created_by: demoUsers[0].id,
      created_at: new Date(reportedAt.getTime() + 60 * 60 * 1000).toISOString(),
    } : null

    const incident = {
      id: incidentId,
      organization_id: demoOrganizationId,
      reference_number: referenceNumber,
      report_type: scenario.reportType,
      status,
      title: `${scenario.title} ${titleSuffix}`,
      description: `${scenario.description} ${detailSuffix}`,
      occurred_at: incidentTimestamp,
      reported_at: reportedTimestamp,
      site_id: uuidFor(seedNamespace, `site-${site.code}`),
      facility_id: uuidFor(seedNamespace, `facility-${site.code}-${facilityName}`),
      location,
      department,
      work_activity_context: `${department} activity on ${shift.name.toLowerCase()} at ${site.name}.`,
      reported_by: reportedBy,
      created_by: reportedBy,
      contractor_involved: contractorInvolved,
      contractor_organization: contractorInvolved ? ['Coastal Technical Services', 'Delta Marine Support', 'Atlantic Industrial Partners'][Math.floor(random() * 3)] : null,
      severity,
      potential_severity: chooseWeighted(random, [
        { value: 'Low', weight: 48 }, { value: 'Medium', weight: 33 }, { value: 'High', weight: 16 }, { value: 'Critical', weight: 3 },
      ]).value,
      incident_category: scenario.category,
      environmental_impact: scenario.reportType === 'environmental_incident',
      injury_or_illness: scenario.category === 'Injury / Illness' || scenario.category === 'Slip/Trip/Fall',
      property_damage: scenario.category === 'Property / Equipment Damage' || scenario.category === 'Vehicle / Transportation Incident',
      work_related: true,
      immediate_correction: actionPlans[Math.floor(random() * actionPlans.length)],
      priority: severity === 'Critical' || severity === 'High' ? 'High' : severity,
      gps_coordinates: `${site.latitude.toFixed(4)}, ${site.longitude.toFixed(4)}`,
      weather_conditions: ['Warm and dry', 'Light rain', 'Humid with moderate wind', 'Overcast'][Math.floor(random() * 4)],
      equipment_involved: scenario.category.includes('Vehicle') || scenario.title.includes('Forklift') ? 'Site vehicle or forklift' : scenario.category.includes('Electrical') ? 'Portable electrical equipment' : 'Relevant work equipment',
      people_involved: `${reporter.fullName}; ${['operator', 'technician', 'site supervisor', 'contractor representative'][Math.floor(random() * 4)]}`,
      witnesses: random() < 0.45 ? demoUsers[Math.floor(random() * demoUsers.length)].fullName : null,
      potential_root_cause: ['Work area condition', 'Task planning and coordination', 'Equipment condition', 'PPE compliance', 'Housekeeping and access control'][Math.floor(random() * 5)],
      digital_signature: null,
      accuracy_confirmed: true,
      draft_stage: 3,
      created_at: createdTimestamp,
      updated_at: createdTimestamp,
    }
    rows.push({ incident, investigation, scenario, reporter, status, seedId, reportedAt, occurrenceDate, site, department, shift, severity })
  }

  const drafts = Array.from({ length: demoDraftCount }, (_, index) => {
    const seedId = index + 1
    const reporter = demoUsers[(index * 3) % demoUsers.length]
    const daysAgo = (demoDraftCount - index) * 2
    const occurredAt = new Date(Math.min(reportEnd, Date.now()) - daysAgo * dayMs)
    return {
      id: uuidFor(seedNamespace, `draft-${String(seedId).padStart(3, '0')}`),
      organization_id: demoOrganizationId,
      reference_number: `DEMO-DRAFT-${String(seedId).padStart(4, '0')}`,
      report_type: reportTypes[index % reportTypes.length],
      status: 'draft',
      title: index % 3 === 0 ? 'Untitled draft' : ['Equipment condition under review', 'Work area observation recorded', 'Initial event details being gathered'][index % 3],
      description: null,
      occurred_at: occurredAt.toISOString(),
      reported_at: null,
      site_id: null,
      facility_id: null,
      location: null,
      department: null,
      shift: null,
      work_activity_context: null,
      reported_by: reporter.id,
      created_by: reporter.id,
      contractor_involved: false,
      contractor_organization: null,
      severity: null,
      potential_severity: null,
      incident_category: null,
      environmental_impact: false,
      injury_or_illness: false,
      property_damage: false,
      work_related: true,
      immediate_correction: null,
      priority: null,
      gps_coordinates: null,
      weather_conditions: null,
      equipment_involved: null,
      people_involved: null,
      witnesses: null,
      potential_root_cause: null,
      digital_signature: null,
      accuracy_confirmed: false,
      draft_stage: index % 3,
      created_at: occurredAt.toISOString(),
      updated_at: occurredAt.toISOString(),
    }
  })

  return { rows, drafts }
}

function values(rows, columns) {
  return rows.map((row) => `(${columns.map((column) => sql(row[column])).join(', ')})`).join(',\n')
}

function buildSeedSql(authUsers, records, demoOrganizationId) {
  const siteRows = sites.map((site) => ({ id: uuidFor(seedNamespace, `site-${site.code}`), organization_id: demoOrganizationId, ...site }))
  const facilityRows = siteRows.map((site) => {
    const facilityName = `${site.name.replace(' Site', '').replace(' Base', '')} - Main Operations Area`
    return { id: uuidFor(seedNamespace, `facility-${site.code}-${facilityName}`), organization_id: demoOrganizationId, site_id: site.id, name: facilityName, code: `${site.code}-FAC-01` }
  })
  const userRows = authUsers
  const incidents = records.rows.map(({ incident }) => incident)
  const investigationRows = records.rows.flatMap(({ investigation }) => investigation ? [investigation] : [])
  const peopleRows = records.rows.flatMap((record) => {
    if (record.seedId % 5 !== 0) return []
    const involved = authUsers[(record.seedId * 7) % authUsers.length]
    return [{
      id: uuidFor(seedNamespace, `person-${record.seedId}`), organization_id: demoOrganizationId,
      incident_id: record.incident.id, person_type: record.incident.injury_or_illness ? 'affected_person' : 'witness',
      profile_id: involved.id, full_name: involved.fullName, organization_name: record.incident.contractor_organization,
      contact_details: null, created_at: record.reportedAt.toISOString(),
    }]
  })
  const activityRows = records.rows.filter((record) => record.seedId % 18 === 0).flatMap((record) => {
    const activities = [
      ['Incident submitted', record.reportedAt, { incident_id: record.incident.id, report_type: record.incident.report_type }],
      ...(record.status === 'closed' ? [['Incident status changed', new Date(record.reportedAt.getTime() + 7 * 86400000), { incident_id: record.incident.id, from_status: 'under_review', to_status: 'closed' }]] : []),
    ]
    return activities.map(([activity, createdAt, metadata], index) => ({
      id: uuidFor(seedNamespace, `activity-${record.seedId}-${index}`), organization_id: demoOrganizationId,
      user_id: record.reporter.id, activity, metadata, location: record.incident.location, created_at: createdAt.toISOString(),
    }))
  })

  const profileValues = userRows.map((user, index) => `(${[
    sql(user.id), sql(demoOrganizationId), sql(user.employeeId), sql(user.fullName), sql(user.department),
    sql(user.jobTitle), sql(`+234801234${String(index + 1).padStart(4, '0')}`), sql(null), sql(sites[user.siteIndex].name), sql('Adebayo Adeyemi'),
    sql('Current'), sql(user.employmentType), sql('active'),
  ].join(', ')})`).join(',\n')
  const membershipValues = userRows.map((user) => `(${sql(user.id)}, ${sql(demoOrganizationId)}, ${sql(user.role)})`).join(',\n')
  const preferenceValues = userRows.map((user) => `(${sql(user.id)}, TRUE, FALSE, TRUE, TRUE, TRUE, TRUE)`).join(',\n')
  const companySettings = {
    working_hours: { shifts },
    departments: departments.map((name) => ({ name, active: true })),
    operational_sites: sites.map(({ name }) => ({ name, active: true })),
    emergency_contacts: [
      { id: 'demo-control-room', name: 'Demo Control Room', role: 'Operations response', phone: '+2348012349901', email: 'control-room.demo@example.com', active: true },
      { id: 'demo-hse-desk', name: 'Demo HSE Duty Desk', role: 'HSE response', phone: '+2348012349902', email: 'hse-duty.demo@example.com', active: true },
    ],
    incident_categories: categories.map((name) => ({ name, active: true })),
    risk_categories: [], severity_levels: severities.map((name) => ({ name, active: true })), inspection_templates: [],
  }
  const siteValues = values(siteRows, ['id', 'organization_id', 'name', 'code', 'address', 'latitude', 'longitude'])
  const facilityValues = values(facilityRows, ['id', 'organization_id', 'site_id', 'name', 'code'])
  const siteIdentityChecks = siteRows.map((site) => `(code = ${sql(site.code)} AND id <> ${sql(site.id)}::uuid)`).join(' OR ')
  const facilityIdentityChecks = facilityRows.map((facility) => `(code = ${sql(facility.code)} AND id <> ${sql(facility.id)}::uuid)`).join(' OR ')
  const incidentColumns = [
    'id', 'organization_id', 'reference_number', 'report_type', 'status', 'title', 'description', 'occurred_at',
    'reported_at', 'site_id', 'facility_id', 'location', 'department', 'work_activity_context', 'reported_by', 'created_by',
    'contractor_involved', 'contractor_organization', 'severity', 'potential_severity', 'incident_category',
    'environmental_impact', 'injury_or_illness', 'property_damage', 'work_related', 'immediate_correction', 'priority',
    'gps_coordinates', 'weather_conditions', 'equipment_involved', 'people_involved', 'witnesses', 'potential_root_cause',
    'digital_signature', 'accuracy_confirmed', 'draft_stage', 'created_at', 'updated_at',
  ]
  const incidentUpdates = incidentColumns.filter((column) => !['id', 'organization_id', 'reference_number'].includes(column)).map((column) => `${column} = EXCLUDED.${column}`).join(',\n  ')
  const investigationColumns = [
    'id', 'organization_id', 'incident_id', 'status', 'assigned_investigator_id', 'investigation_lead_id', 'assigned_by',
    'assigned_at', 'started_at', 'target_completion_date', 'completed_at', 'investigation_summary', 'findings_summary',
    'conclusions', 'created_by', 'created_at',
  ]
  const investigationUpdates = investigationColumns.filter((column) => !['id', 'organization_id', 'incident_id'].includes(column)).map((column) => `${column} = EXCLUDED.${column}`).join(',\n  ')
  const draftColumns = incidentColumns
  const draftUpdates = draftColumns.filter((column) => !['id', 'organization_id', 'reference_number'].includes(column)).map((column) => `${column} = EXCLUDED.${column}`).join(',\n  ')
  const requiredColumns = [
    ['organizations', ['id', 'company_code', 'company_name', 'industry', 'company_size', 'region', 'country', 'state', 'address', 'contact_email', 'contact_phone']],
    ['profiles', ['id', 'organization_id', 'employee_id', 'full_name', 'department', 'job_title', 'phone', 'emergency_contact', 'site_location', 'supervisor', 'certification_status', 'employment_type', 'account_status']],
    ['memberships', ['user_id', 'organization_id', 'role']],
    ['notification_preferences', ['user_id', 'email', 'sms', 'push', 'incident_assignments', 'corrective_action_reminders', 'audit_reminders']],
    ['company_settings', ['organization_id', 'working_hours', 'departments', 'operational_sites', 'emergency_contacts', 'incident_categories', 'risk_categories', 'severity_levels', 'inspection_templates']],
    ['sites', ['id', 'organization_id', 'name', 'code', 'address', 'latitude', 'longitude']],
    ['facilities', ['id', 'organization_id', 'site_id', 'name', 'code']],
    ['incidents', incidentColumns],
    ['investigations', investigationColumns],
    ['incident_people', ['id', 'organization_id', 'incident_id', 'person_type', 'profile_id', 'full_name', 'organization_name', 'contact_details', 'created_at']],
    ['activity_logs', ['id', 'organization_id', 'user_id', 'activity', 'metadata', 'location', 'created_at']],
  ].flatMap(([table, columns]) => columns.map((column) => `('${table}', '${column}')`)).join(', ')
  const requiredStatuses = ['draft', 'submitted', 'under_review', 'investigation', 'corrective_action', 'pending_verification', 'closed']
    .map((status) => `(${sql(status)})`).join(', ')

  return `BEGIN;
DO $schema$
BEGIN
  IF to_regclass('public.organizations') IS NULL OR to_regclass('public.profiles') IS NULL
    OR to_regclass('public.memberships') IS NULL OR to_regclass('public.company_settings') IS NULL
    OR to_regclass('public.sites') IS NULL OR to_regclass('public.facilities') IS NULL
    OR to_regclass('public.incidents') IS NULL OR to_regclass('public.investigations') IS NULL
    OR to_regclass('public.incident_people') IS NULL OR to_regclass('public.activity_logs') IS NULL
    OR to_regclass('public.notification_preferences') IS NULL THEN
    RAISE EXCEPTION 'SentinelQHSE seed schema preflight failed: required public tables are missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES ${requiredColumns}) AS required(table_name, column_name)
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns column_info
      WHERE column_info.table_schema='public' AND column_info.table_name=required.table_name
        AND column_info.column_name=required.column_name)
  ) THEN
    RAISE EXCEPTION 'SentinelQHSE seed schema preflight failed: required columns are missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES ${requiredStatuses}) AS required(label)
    WHERE NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
      WHERE t.typname='incident_status' AND t.typnamespace='public'::regnamespace AND e.enumlabel=required.label)
  ) THEN
    RAISE EXCEPTION 'SentinelQHSE seed schema preflight failed: expected incident status values are missing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE company_code = ${sql(demoCompanyCode)} AND id <> ${sql(demoOrganizationId)}::uuid) THEN
    RAISE EXCEPTION 'Demo company code already belongs to a different organization; refusing to modify it';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE id = ${sql(demoOrganizationId)}::uuid AND company_name <> ${sql(demoCompanyName)}) THEN
    RAISE EXCEPTION 'Stable demo organization ID is already used by another organization';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id IN (${userRows.map((user) => `${sql(user.id)}::uuid`).join(', ')}) AND organization_id <> ${sql(demoOrganizationId)}::uuid) THEN
    RAISE EXCEPTION 'A demo Auth user already has a profile in a different organization';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sites WHERE organization_id = ${sql(demoOrganizationId)}::uuid AND (${siteIdentityChecks})) THEN
    RAISE EXCEPTION 'A demo site code is already attached to a different site ID; refusing to seed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.facilities WHERE organization_id = ${sql(demoOrganizationId)}::uuid AND (${facilityIdentityChecks})) THEN
    RAISE EXCEPTION 'A demo facility code is already attached to a different facility ID; refusing to seed';
  END IF;
END;
$schema$;

INSERT INTO public.organizations (id, company_code, company_name, industry, company_size, region, country, state, address, contact_email, contact_phone)
VALUES (${sql(demoOrganizationId)}, ${sql(demoCompanyCode)}, ${sql(demoCompanyName)}, 'Energy and Industrial Services', 'Medium', 'South West', 'Nigeria', 'Lagos', 'DEMO DATA ONLY - no real operating facility represented', 'demo-admin@example.com', '+2348000000000')
ON CONFLICT (id) DO UPDATE SET
  company_code=EXCLUDED.company_code, company_name=EXCLUDED.company_name,
  industry=EXCLUDED.industry, company_size=EXCLUDED.company_size, region=EXCLUDED.region,
  country=EXCLUDED.country, state=EXCLUDED.state, address=EXCLUDED.address,
  contact_email=EXCLUDED.contact_email, contact_phone=EXCLUDED.contact_phone;

INSERT INTO public.company_settings (organization_id, working_hours, departments, operational_sites, emergency_contacts, incident_categories, risk_categories, severity_levels, inspection_templates)
VALUES (${sql(demoOrganizationId)}, ${sql(companySettings.working_hours)}, ${sql(companySettings.departments)}, ${sql(companySettings.operational_sites)}, ${sql(companySettings.emergency_contacts)}, ${sql(companySettings.incident_categories)}, ${sql(companySettings.risk_categories)}, ${sql(companySettings.severity_levels)}, ${sql(companySettings.inspection_templates)})
ON CONFLICT (organization_id) DO UPDATE SET
  working_hours = EXCLUDED.working_hours, departments = EXCLUDED.departments,
  operational_sites = EXCLUDED.operational_sites, emergency_contacts = EXCLUDED.emergency_contacts,
  incident_categories = EXCLUDED.incident_categories, risk_categories = EXCLUDED.risk_categories,
  severity_levels = EXCLUDED.severity_levels, inspection_templates = EXCLUDED.inspection_templates;

INSERT INTO public.sites (id, organization_id, name, code, address, latitude, longitude)
VALUES ${siteValues}
ON CONFLICT (organization_id, code) DO UPDATE SET name=EXCLUDED.name, address=EXCLUDED.address, latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude;

INSERT INTO public.facilities (id, organization_id, site_id, name, code)
VALUES ${facilityValues}
ON CONFLICT (organization_id, code) DO UPDATE SET site_id=EXCLUDED.site_id, name=EXCLUDED.name;

INSERT INTO public.profiles (id, organization_id, employee_id, full_name, department, job_title, phone, emergency_contact, site_location, supervisor, certification_status, employment_type, account_status)
VALUES ${profileValues}
ON CONFLICT (id) DO UPDATE SET employee_id=EXCLUDED.employee_id, full_name=EXCLUDED.full_name,
  department=EXCLUDED.department, job_title=EXCLUDED.job_title, phone=EXCLUDED.phone,
  site_location=EXCLUDED.site_location, supervisor=EXCLUDED.supervisor,
  certification_status=EXCLUDED.certification_status, employment_type=EXCLUDED.employment_type,
  account_status='active'
WHERE public.profiles.organization_id = EXCLUDED.organization_id;

INSERT INTO public.memberships (user_id, organization_id, role)
VALUES ${membershipValues}
ON CONFLICT (user_id, organization_id) DO UPDATE SET role=EXCLUDED.role;

INSERT INTO public.notification_preferences (user_id, email, sms, push, incident_assignments, corrective_action_reminders, audit_reminders)
VALUES ${preferenceValues}
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.incidents (${incidentColumns.join(', ')})
VALUES ${values(incidents, incidentColumns)}
ON CONFLICT (id) DO UPDATE SET ${incidentUpdates};

INSERT INTO public.incidents (${draftColumns.join(', ')})
VALUES ${values(records.drafts, draftColumns)}
ON CONFLICT (id) DO UPDATE SET ${draftUpdates};

INSERT INTO public.investigations (${investigationColumns.join(', ')})
VALUES ${values(investigationRows, investigationColumns)}
ON CONFLICT (organization_id, incident_id) DO UPDATE SET ${investigationUpdates};

INSERT INTO public.incident_people (id, organization_id, incident_id, person_type, profile_id, full_name, organization_name, contact_details, created_at)
VALUES ${values(peopleRows, ['id', 'organization_id', 'incident_id', 'person_type', 'profile_id', 'full_name', 'organization_name', 'contact_details', 'created_at'])}
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.activity_logs (id, organization_id, user_id, activity, metadata, location, created_at)
VALUES ${values(activityRows, ['id', 'organization_id', 'user_id', 'activity', 'metadata', 'location', 'created_at'])}
ON CONFLICT (id) DO NOTHING;

COMMIT;`
}

function readEnvFile(contents) {
  const entries = new Map()
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match || match[1].startsWith('VITE_')) continue
    let value = match[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    entries.set(match[1], value)
  }
  return entries
}

async function loadLocalEnv() {
  const values = new Map(Object.entries(process.env))
  for (const fileName of ['.env', '.env.local']) {
    try {
      for (const [key, value] of await readEnvFile(await readTextFile(path.resolve(fileName), 'utf8'))) {
        if (!values.has(key)) values.set(key, value)
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  return values
}

function parseArgs(args) {
  return {
    plan: args.includes('--plan'),
    dryRun: args.includes('--dry-run'),
    validateOnly: args.includes('--validate-only'),
    confirmRemote: args.find((arg) => arg.startsWith('--confirm-remote='))?.split('=', 2)[1] || '',
  }
}

function targetProjectRef(url) {
  try {
    const host = new URL(url).hostname
    return host.endsWith('.supabase.co') ? host.slice(0, -'.supabase.co'.length) : null
  } catch {
    return null
  }
}

function databaseProjectRef(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl)
    const directMatch = parsed.hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/)
    if (directMatch) return directMatch[1]
    if (parsed.hostname.endsWith('.pooler.supabase.com')) {
      const username = decodeURIComponent(parsed.username)
      const poolerRef = username.match(/\.([a-z0-9]{20})$/)
      return poolerRef?.[1] || null
    }
    return null
  } catch {
    return null
  }
}

async function resolveDemoOrganization(client) {
  const { data: byCode, error: codeError } = await client
    .from('organizations')
    .select('id, company_code, company_name, address')
    .eq('company_code', demoCompanyCode)
    .maybeSingle()
  if (codeError) throw new Error(`Unable to check for the demo organization: ${codeError.message}`)
  if (byCode) {
    if (byCode.company_name !== demoCompanyName) throw new Error('The demo company code belongs to an organization with a different name; refusing to seed it.')
    return byCode.id
  }

  const { data: byName, error: nameError } = await client
    .from('organizations')
    .select('id, company_code, company_name, address')
    .eq('company_name', demoCompanyName)
    .maybeSingle()
  if (nameError) throw new Error(`Unable to check for an existing demo organization: ${nameError.message}`)
  if (byName) {
    if (!byName.address?.startsWith('DEMO DATA ONLY')) throw new Error('An organization with the requested demo name exists without the demo marker; refusing to overwrite it.')
    return byName.id
  }
  return defaultDemoOrganizationId
}

async function requireTargetSafety(url, databaseUrl, confirmRemote) {
  const apiHost = new URL(url).hostname
  const databaseHost = new URL(databaseUrl).hostname
  const localHosts = ['localhost', '127.0.0.1', '::1']
  const isLocalApi = localHosts.includes(apiHost)
  const isLocalDatabase = localHosts.includes(databaseHost)
  if (isLocalApi && isLocalDatabase) return { local: true, ref: null }
  if (isLocalApi !== isLocalDatabase) throw new Error('Seed blocked: SUPABASE_URL and SUPABASE_DB_URL must target the same local or remote environment.')

  const ref = targetProjectRef(url)
  const dbRef = databaseProjectRef(databaseUrl)
  if (!ref || ref !== dbRef) throw new Error('Remote seed blocked: the database endpoint does not match the Supabase API project ref.')
  if (confirmRemote !== ref) throw new Error(`Remote seed blocked. For this demo project only, pass --confirm-remote=${ref} after confirming the target.`)
  return { local: false, ref }
}

async function listAllAuthUsers(client) {
  const byEmail = new Map()
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`Unable to inspect existing Auth users: ${error.message}`)
    for (const user of data.users) if (user.email) byEmail.set(user.email.toLowerCase(), user)
    if (data.users.length < 1000) return byEmail
  }
}

async function ensureAuthUsers(client, password, created) {
  const existingUsers = await listAllAuthUsers(client)
  const result = []
  for (const [index, seedUser] of users.entries()) {
    let authUser = existingUsers.get(seedUser.email)
    if (authUser) {
      if (authUser.user_metadata?.sentinel_demo !== true) throw new Error(`Refusing to adopt existing non-demo Auth account for ${seedUser.email}.`)
    } else {
      const { data, error } = await client.auth.admin.createUser({
        email: seedUser.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: seedUser.fullName, sentinel_demo: true },
        app_metadata: { sentinel_demo: true },
      })
      if (error || !data.user) throw new Error(`Unable to create demo Auth user ${index + 1}: ${error?.message || 'no user returned'}`)
      authUser = data.user
      created.push(authUser.id)
    }
    result.push({ ...seedUser, id: authUser.id })
  }
  return { users: result, created }
}

async function runPostgresQuery(databaseUrl, query, displayResults = false) {
  const client = new PostgresClient({ connectionString: databaseUrl })
  await client.connect()
  try {
    const results = await client.query(query)
    if (displayResults) {
      const resultSets = Array.isArray(results) ? results : [results]
      for (const result of resultSets) {
        if (result.rows?.length) console.table(result.rows)
      }
    }
  } finally {
    await client.end()
  }
}

async function cleanupNewAuthUsers(client, userIds) {
  for (const userId of [...userIds].reverse()) {
    const { error } = await client.auth.admin.deleteUser(userId)
    if (error) console.error(`Cleanup could not remove a newly created demo Auth identity (${error.status || 'Auth API error'}). Re-run the idempotent seed after resolving the database error.`)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.plan) {
    console.log(JSON.stringify({ organization: demoCompanyName, organizationCode: demoCompanyCode, users: users.length, incidents: demoIncidentCount, drafts: demoDraftCount, sites: sites.length, departments: departments.length, shifts: shifts.length, categories: categories.length, severities, dateRange: ['2023-09-29', '2026-09-29'], correctiveActions: 'Not supported by the migrated schema' }, null, 2))
    return
  }

  if (args.dryRun) {
    const demoUsers = users.map((user) => ({ ...user }))
    const records = makeRecords(demoUsers, defaultDemoOrganizationId)
    const sqlText = buildSeedSql(demoUsers, records, defaultDemoOrganizationId)
    const allowedStatuses = new Set(['draft', 'submitted', 'under_review', 'investigation', 'corrective_action', 'pending_verification', 'closed'])
    if (records.rows.length !== demoIncidentCount || records.drafts.length !== demoDraftCount) throw new Error('Generated record count check failed.')
    if (records.rows.some(({ incident }) => !allowedStatuses.has(incident.status) || !categories.includes(incident.incident_category) || !severities.includes(incident.severity))) throw new Error('Generated incident enum/configuration check failed.')
    if (records.rows.some(({ incident }) => new Date(incident.occurred_at) > new Date(incident.reported_at))) throw new Error('Generated incident/report chronology check failed.')
    if (!sqlText.startsWith('BEGIN;') || !sqlText.trimEnd().endsWith('COMMIT;') || /^\+/m.test(sqlText)) throw new Error('Generated SQL transaction/format check failed.')
    const statusCounts = Object.fromEntries([...allowedStatuses].map((status) => [status, records.rows.filter(({ incident }) => incident.status === status).length]))
    console.log(JSON.stringify({ dryRun: true, generatedIncidents: records.rows.length, generatedDrafts: records.drafts.length, generatedInvestigations: records.rows.filter((record) => record.investigation).length, sqlBytes: Buffer.byteLength(sqlText), statuses: statusCounts, firstIncident: records.rows[0].incident.reference_number, lastIncident: records.rows.at(-1).incident.reference_number }, null, 2))
    return
  }

  const env = await loadLocalEnv()
  const url = env.get('SUPABASE_URL') || env.get('VITE_SUPABASE_URL') || ''
  if (!url) throw new Error('Set SUPABASE_URL or VITE_SUPABASE_URL in the environment or ignored .env.local file.')
  const databaseUrl = env.get('SUPABASE_DB_URL') || ''
  if (!databaseUrl) throw new Error('Set server-only SUPABASE_DB_URL in the environment or ignored .env.local file.')
  const target = await requireTargetSafety(url, databaseUrl, args.confirmRemote)

  if (args.validateOnly) {
    const validationFile = path.resolve('supabase/seed_validation.sql')
    const validationSql = await readFile(validationFile, 'utf8')
    if (!target.local) console.log(`Validating explicitly confirmed demo project ${target.ref} (read-only).`)
    await runPostgresQuery(databaseUrl, validationSql, true)
    return
  }

  const serviceRoleKey = env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const password = env.get('DEMO_USER_PASSWORD') || ''
  if (!serviceRoleKey) throw new Error('Set server-only SUPABASE_SERVICE_ROLE_KEY in the environment or ignored .env.local file.')
  if (!password) throw new Error('Set DEMO_USER_PASSWORD to a strong demo-only password. It is never printed or written to the repository.')
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  let authUsers = { users: [], created: [] }
  try {
    const demoOrganizationId = await resolveDemoOrganization(client)
    console.log(`Preparing ${users.length} demo Auth accounts and ${demoIncidentCount} incidents plus ${demoDraftCount} drafts.`)
    authUsers.users = await ensureAuthUsers(client, password, authUsers.created)
    const records = makeRecords(authUsers.users, demoOrganizationId)
    const sqlText = buildSeedSql(authUsers.users, records, demoOrganizationId)
    if (!target.local) console.log(`Target confirmed: demo project ${target.ref}.`)
    await runPostgresQuery(databaseUrl, sqlText)
    console.log(`Seed complete: organization ${demoCompanyName}; ${users.length} Auth users; ${demoIncidentCount} submitted/workflow incidents; ${demoDraftCount} drafts; ${records.rows.filter((row) => row.investigation).length} investigations.`)
    console.log('No corrective actions or uploaded evidence files were created because those storage/workflow structures are absent from the migrated schema.')
    console.log('Run `npm run seed:demo -- --validate-only --confirm-remote=<linked-project-ref>` for the read-only validation report.')
  } catch (error) {
    await cleanupNewAuthUsers(client, authUsers.created)
    throw error
  }
}

main().catch((error) => {
  console.error(`Demo seed failed: ${error instanceof Error ? error.message : 'unknown error'}`)
  process.exitCode = 1
})
