import { createClient } from 'npm:@supabase/supabase-js@2'

type Reporter = { id: string; full_name: string; department: string; employee_id: string }
type Site = { id: string; name: string }
type Facility = { id: string; site_id: string; name: string }
type MockIncident = Record<string, string | number | boolean | null>
type SeedOptions = {
  categories: string[]
  severities: string[]
  departments: string[]
  shifts: string[]
}

const organizationId = '25ad3a5c-514b-4097-96a6-a712c715d92b'
const organizationCode = 'SENT-23FKES'
const batchId = 'MOCK-STARNET-INCIDENTS-20260929'
const endDate = new Date('2026-09-29T00:00:00.000Z')
const startDate = new Date('2023-09-29T00:00:00.000Z')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6D2B79F5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function choose<T>(values: readonly T[], random: () => number): T {
  return values[Math.floor(random() * values.length)]
}

function chance(random: () => number, probability: number) {
  return random() < probability
}

function activeSettingNames(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set()
  return new Set(value.flatMap((entry) => {
    if (typeof entry === 'string') return entry.trim() ? [entry.trim().toLowerCase()] : []
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Record<string, unknown>
    return typeof item.name === 'string' && item.name.trim() && item.active !== false
      ? [item.name.trim().toLowerCase()]
      : []
  }))
}

function monthDate(monthOffset: number, random: () => number, serial: number) {
  if (serial === 1) return new Date(startDate)
  if (serial === 1000) return new Date(endDate)
  const absoluteMonth = 8 + monthOffset
  const year = 2023 + Math.floor(absoluteMonth / 12)
  const month = absoluteMonth % 12
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const minimumDay = year === 2023 && month === 8 ? 29 : 1
  const maximumDay = year === 2026 && month === 8 ? 29 : daysInMonth
  const day = minimumDay + Math.floor(random() * (maximumDay - minimumDay + 1))
  return new Date(Date.UTC(year, month, day))
}

function chooseMonth(random: () => number) {
  const weights = Array.from({ length: 36 }, (_, offset) => {
    const month = (8 + offset) % 12
    let weight = [3, 2, 2, 3, 5, 6, 6, 5, 4, 3, 2, 2][month]
    if ([5, 6, 7, 8].includes(month)) weight *= 1.22
    if ([11, 0].includes(month)) weight *= 1.12
    if ([4, 19, 31].includes(offset)) weight *= 1.55
    return weight
  })
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let ticket = random() * total
  for (let offset = 0; offset < weights.length; offset += 1) {
    ticket -= weights[offset]
    if (ticket <= 0) return offset
  }
  return 35
}

function makeIncidentRows(reporters: Reporter[], sites: Site[], facilities: Facility[], options: SeedOptions): MockIncident[] {
  const random = seededRandom(20260929)
  const siteByName = new Map(sites.map((site) => [site.name.toLowerCase(), site]))
  const facilityBySite = new Map<string, Facility[]>()
  for (const facility of facilities) facilityBySite.set(facility.site_id, [...(facilityBySite.get(facility.site_id) ?? []), facility])

  const reporterWeights = reporters.map((_, index) => Math.max(1, 22 - index * 1.1))
  const reporterWeightTotal = reporterWeights.reduce((sum, weight) => sum + weight, 0)
  const pickReporter = () => {
    let ticket = random() * reporterWeightTotal
    for (let index = 0; index < reporterWeights.length; index += 1) {
      ticket -= reporterWeights[index]
      if (ticket <= 0) return reporters[index]
    }
    return reporters[reporters.length - 1]
  }

  const categories = options.categories.flatMap((category) => category.toLowerCase() === 'near miss' ? [category, category, category] : category.toLowerCase() === 'slip/trip/fall' ? [category, category] : [category])
  const severities = options.severities.flatMap((severity) => severity.toLowerCase() === 'low' ? [severity, severity, severity, severity] : severity.toLowerCase() === 'medium' ? [severity, severity, severity] : severity.toLowerCase() === 'high' ? [severity, severity] : [severity])
  const siteNames = sites.map((site) => site.name)
  const contractors = ['Niger Delta Well Services Ltd', 'Coastal Integrity Nigeria Ltd', 'Apex Marine Support Ltd', 'Eastern Plant Maintenance Ltd'] as const
  const people = ['Kelechi Nnadi', 'Bisi Adekunle', 'Yusuf Garba', 'Nseobong Udo', 'Tari Benibo', 'Chiamaka Obi', 'Sola Akinwale', 'Hauwa Lawal'] as const
  const events = ['during a routine transfer', 'at shift handover', 'during planned maintenance', 'while returning equipment to service', 'during a pre-start inspection', 'during a rain-related pause', 'while repositioning tools', 'during a permit boundary check'] as const
  const observations = ['a gradual pressure fluctuation', 'a worn retaining clip', 'a loose cable support', 'a slick patch near the work zone', 'an intermittent alarm', 'a delayed isolation response', 'a vehicle reversing blind spot', 'a missing secondary restraint'] as const
  const responses = ['the area was isolated and the supervisor notified', 'the task was paused and the permit reviewed', 'the equipment was tagged out for inspection', 'the spill kit was deployed and the drain protected', 'the route was closed until a banksman was positioned', 'the crew completed a toolbox reset before work resumed', 'the affected item was secured and logged for maintenance'] as const
  const equipmentByCategory: Record<string, readonly string[]> = {
    'Oil/Chemical Spillage': ['chemical transfer hose', 'pump seal assembly', 'diesel day tank connection', 'lubricant tote valve'],
    'Slip/Trip/Fall': ['access stair tread', 'temporary walkway', 'cable ramp', 'grating panel'],
    Fire: ['portable generator', 'electrical distribution board', 'hot-work area', 'hydraulic power pack'],
    'Equipment Failure': ['centrifugal pump', 'air compressor', 'lifting winch', 'process valve actuator'],
    'Near Miss': ['pipe handling tool', 'lifting sling', 'pressure gauge', 'mobile work platform'],
    'Vehicle Incident': ['forklift', 'light vehicle', 'telehandler', 'service truck'],
    'PPE Non-Compliance': ['respiratory protection set', 'fall-arrest harness', 'chemical gloves', 'eye protection'],
    'Electrical Hazard': ['temporary power cable', 'motor isolator', 'junction box', 'portable lighting circuit'],
    'Dropped Object': ['spanner set', 'small-bore fitting', 'tag line hook', 'portable sensor'],
    'Environmental Release': ['produced-water line', 'chemical dosing skid', 'drain isolation valve', 'waste transfer hose'],
  }
  const actions: Record<string, readonly string[]> = {
    'Oil/Chemical Spillage': ['replace the transfer hose and pressure-test the connection', 'install a drip tray and verify the isolation sequence'],
    'Slip/Trip/Fall': ['repair the walking surface and add a documented inspection point', 'reroute and secure temporary cables away from the access path'],
    Fire: ['inspect the power connection and verify fire-watch readiness', 'replace damaged electrical protection and test the shutdown circuit'],
    'Equipment Failure': ['complete a reliability inspection and replace the worn component', 'update the preventive-maintenance interval for this equipment'],
    'Near Miss': ['review the lift plan and repeat the pre-task competency check', 'add a verification step to the job safety analysis'],
    'Vehicle Incident': ['mark the vehicle-pedestrian boundary and require a banksman', 'repair the reversing alarm and confirm the daily vehicle check'],
    'PPE Non-Compliance': ['reissue task-specific PPE and document a fit-for-task briefing', 'add a supervisor PPE check before permit release'],
    'Electrical Hazard': ['replace the damaged cable and complete insulation testing', 'label the isolation point and verify lockout-tagout records'],
    'Dropped Object': ['fit a secondary retention device and inspect adjacent work areas', 'revise the dropped-object check for tools used at height'],
    'Environmental Release': ['repair the line and test containment before restart', 'add a drain-protection check to the transfer checklist'],
  }
  const titleParts: Record<string, readonly string[]> = {
    'Oil/Chemical Spillage': ['Transfer hose seepage', 'Pump seal release', 'Contained chemical drip'],
    'Slip/Trip/Fall': ['Uneven access route', 'Wet walkway slip', 'Grating movement observed'],
    Fire: ['Electrical enclosure smoke', 'Hot-work ignition hazard', 'Generator overheating'],
    'Equipment Failure': ['Pump vibration increase', 'Winch control interruption', 'Valve actuator response fault'],
    'Near Miss': ['Lift path obstruction', 'Unexpected pressure change', 'Unsecured tool identified'],
    'Vehicle Incident': ['Low-speed yard contact', 'Reversing route near miss', 'Vehicle-pedestrian separation'],
    'PPE Non-Compliance': ['Respiratory PPE mismatch', 'Harness connection omission', 'Eye protection gap'],
    'Electrical Hazard': ['Exposed cable section', 'Isolation label discrepancy', 'Temporary power fault'],
    'Dropped Object': ['Loose item at elevation', 'Dropped tool contained', 'Retention point defect'],
    'Environmental Release': ['Produced-water containment alert', 'Drain protection gap', 'Transfer line seepage'],
  }
  const descriptions = ['No injury was reported; the event was recorded for corrective follow-up.', 'The crew stopped work promptly and maintained the exclusion zone until the supervisor completed a review.', 'The condition was identified before the next task step and the work party remained clear of the hazard.', 'The event affected a small, controlled work area and was contained using the site response procedure.']
  const rootCauses = ['The inspection interval did not detect progressive wear before the task began.', 'The work pack did not clearly assign the final verification step at handover.', 'Equipment condition and operating demand were not aligned with the documented maintenance interval.', 'The physical control was available but its use was not confirmed during the pre-task check.', 'Rainwater management and pedestrian routing were not coordinated for the shift.', 'The task risk review did not account for the changing work-front layout.']
  const findings = ['The work party followed the stop-work process and escalated the condition without delay.', 'Inspection records show the warning sign developed between planned checks.', 'The permit boundary was clear, but the equipment-specific control was not independently verified.', 'Weather and housekeeping conditions contributed to the hazard exposure.']
  const correctionDescriptions = ['Immediate isolation and housekeeping controls were completed; the permanent repair was assigned for follow-up.', 'The team removed the affected equipment from service and briefed the incoming shift.', 'The work area was contained, inspected and released after the supervisor confirmed controls.']
  const causeFactors = ['handover detail', 'inspection timing', 'work-front congestion', 'weather exposure', 'equipment age', 'tool control']
  const facilityFor = (site: Site, category: string) => {
    const siteFacilities = facilityBySite.get(site.id) ?? []
    const name = site.name.toLowerCase()
    let preferred: Facility[] = []
    if (category === 'Vehicle Incident') {
      preferred = siteFacilities.filter((facility) => /yard|vehicle|jetty|warehouse/i.test(facility.name))
    } else if (['Oil/Chemical Spillage', 'Environmental Release'].includes(category)) {
      preferred = siteFacilities.filter((facility) => /pump|tank|process|separator|production|materials/i.test(facility.name))
      if (!preferred.length && !/flow|processing|offshore|onshore/i.test(name)) preferred = siteFacilities
    } else if (category === 'Dropped Object') {
      preferred = siteFacilities.filter((facility) => /deck|rig|helideck/i.test(facility.name))
    } else if (['Electrical Hazard', 'Fire', 'Equipment Failure'].includes(category)) {
      preferred = siteFacilities.filter((facility) => /plant|process|power|workshop|unit|pump|deck/i.test(facility.name))
    }
    return choose(preferred.length ? preferred : siteFacilities, random)
  }

  const rows: MockIncident[] = []
  for (let serial = 1; serial <= 1000; serial += 1) {
    const monthOffset = serial <= 36 ? serial - 1 : chooseMonth(random)
    const day = monthDate(monthOffset, random, serial)
    const month = day.getUTCMonth()
    const hour = choose([6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 18, 20], random)
    const minute = Math.floor(random() * 60)
    const occurredAt = new Date(Date.UTC(day.getUTCFullYear(), month, day.getUTCDate(), hour, minute))
    const reportedAt = new Date(occurredAt.getTime() + (15 + Math.floor(random() * 45)) * 60000)
    const category = choose(categories, random)
    const reportedBy = serial <= reporters.length ? reporters[serial - 1] : pickReporter()
    const severity = choose(severities, random)
    const compatibleSites = category === 'Vehicle Incident'
      ? siteNames.filter((name) => /logistics yard|supply base|onshore/i.test(name))
      : ['Oil/Chemical Spillage', 'Environmental Release'].includes(category)
        ? siteNames.filter((name) => /flow station|processing|offshore|onshore/i.test(name))
        : category === 'Dropped Object'
          ? siteNames.filter((name) => /offshore|drilling/i.test(name))
          : siteNames
    const site = siteByName.get(choose(compatibleSites, random).toLowerCase())
    if (!site) throw new Error('A configured StarNet site could not be resolved')
    const facility = facilityFor(site, category)
    if (!facility) throw new Error(`A facility is missing under ${site.name}`)
    const department = choose(options.departments, random)
    const shift = hour >= 7 && hour < 15 ? options.shifts.find((name) => name.toLowerCase() === 'day')!
      : hour >= 15 && hour < 20 ? options.shifts.find((name) => name.toLowerCase() === 'afternoon')!
      : options.shifts.find((name) => name.toLowerCase() === 'night')!
    const contractorInvolved = chance(random, 0.29)
    const contractorOrganization = contractorInvolved ? choose(contractors, random) : null
    const injured = !['Near Miss', 'PPE Non-Compliance'].includes(category) && chance(random, 0.14)
    const propertyDamage = !['Near Miss', 'PPE Non-Compliance'].includes(category) && chance(random, 0.17)
    const environmentalImpact = ['Oil/Chemical Spillage', 'Environmental Release'].includes(category)
    const reportType = category === 'Near Miss' ? 'near_miss'
      : environmentalImpact ? 'environmental_incident'
      : category === 'PPE Non-Compliance' ? 'unsafe_act'
      : ['Electrical Hazard', 'Dropped Object'].includes(category) ? 'unsafe_condition'
      : 'incident'

    const statusRoll = random() * 100
    const status = statusRoll < 21 ? 'submitted'
      : statusRoll < 35 ? 'under_review'
      : statusRoll < 52 ? 'investigation'
      : statusRoll < 73 ? 'corrective_action'
      : statusRoll < 85 ? 'pending_verification'
      : 'closed'
    const hasInvestigation = ['investigation', 'corrective_action', 'pending_verification', 'closed'].includes(status)
    const investigationStatus = !hasInvestigation ? null
      : status !== 'investigation' ? 'completed'
      : choose(['assigned', 'in_progress', 'pending_review'], random)
    const potentialRootCause = chance(random, 0.5) ? choose(rootCauses, random) : null
    const formalRootCause = status === 'closed' || chance(random, 0.45) ? choose(rootCauses, random) : null
    const rootCause = hasInvestigation ? (formalRootCause ?? (status === 'closed' ? choose(rootCauses, random) : null)) : null
    const needsAction = ['corrective_action', 'pending_verification', 'closed'].includes(status)
      || (status === 'investigation' && chance(random, 0.34))
    const actionStatus = !needsAction ? null
      : status === 'pending_verification' ? 'verified'
      : status === 'closed' ? (chance(random, 0.25) ? 'closed' : 'verified')
      : status === 'corrective_action' ? choose(['assigned', 'in_progress'], random)
      : 'assigned'
    const owner = choose(reporters.filter((reporter) => reporter.id !== reportedBy.id), random)
    const dueDate = new Date(occurredAt.getTime() + (8 + Math.floor(random() * 26)) * 86400000).toISOString().slice(0, 10)

    const event = choose(events, random)
    const observation = choose(observations, random)
    const response = choose(responses, random)
    const equipment = choose(equipmentByCategory[category], random)
    const title = `${choose(titleParts[category], random)} - ${facility.name} [ST-${String(serial).padStart(4, '0')}]`
    const narrative = `${reportedBy.full_name} recorded ${category.toLowerCase()} ${event} at ${facility.name}. The crew observed ${observation} involving the ${equipment}. ${choose(descriptions, random)} ${response}. Mock batch reference ST-${String(serial).padStart(4, '0')}.`
    const weather = [4, 5, 6, 7, 8, 9].includes(month)
      ? choose(['Intermittent rain, humid conditions', 'Heavy shower earlier; wet deck', 'Overcast with light rain', 'Warm, humid, rain clearing'], random)
      : choose(['Hot and dry with light haze', 'Dry, dusty conditions', 'Humid with calm wind', 'Cloudy and dry, visibility good'], random)
    const affectedPerson = injured || (propertyDamage && chance(random, 0.3)) ? choose(people, random) : null
    const witnessName = chance(random, 0.34) ? choose(people.filter((person) => person !== affectedPerson), random) : null
    const involvedText = affectedPerson ? `${affectedPerson}; ${reportedBy.full_name} (reporter)` : `${reportedBy.full_name} (reporter); work party of ${2 + Math.floor(random() * 7)}`
    const potentialSeverity = reportType === 'near_miss' || chance(random, 0.31) ? choose(severities, random) : null
    const base = site.name.toLowerCase().includes('offshore') || site.name.toLowerCase() === 'offshore' ? { lat: 4.6, lon: 7.8 }
      : site.name.toLowerCase().includes('eket') || site.name.toLowerCase().includes('akwa') ? { lat: 4.65, lon: 7.93 }
      : { lat: 4.82, lon: 7.15 }
    const gpsCoordinates = `${(base.lat + (random() - 0.5) * 0.08).toFixed(5)}, ${(base.lon + (random() - 0.5) * 0.08).toFixed(5)}`

    rows.push({
      batch_index: serial,
      report_type: reportType,
      desired_status: status,
      title,
      description: narrative,
      occurred_at: occurredAt.toISOString(),
      reported_at: reportedAt.toISOString(),
      site_id: site.id,
      facility_id: facility.id,
      location: `${facility.name}, ${site.name}`,
      department,
      shift,
      work_activity_context: `${choose(['routine operations', 'planned maintenance', 'materials handling', 'inspection and testing', 'permit-controlled task'], random)}; ${hour < 7 || hour >= 19 ? 'night operations' : 'day operations'}`,
      reported_by: reportedBy.id,
      severity,
      potential_severity: potentialSeverity,
      incident_category: category,
      environmental_impact: environmentalImpact,
      injury_or_illness: injured,
      property_damage: propertyDamage,
      work_related: true,
      immediate_correction: `${response}. ${choose(['The supervisor recorded the control in the shift log.', 'The work party confirmed the area was safe before resuming.', 'The incoming crew received a handover on the temporary control.'], random)}`,
      priority: severity === 'Critical' ? 'Critical' : severity === 'High' ? 'High' : severity === 'Medium' ? 'Medium' : 'Low',
      gps_coordinates: gpsCoordinates,
      weather_conditions: weather,
      equipment_involved: equipment,
      people_involved: involvedText,
      witnesses: witnessName ? `${witnessName}; contact details recorded in the site log` : `${reportedBy.full_name} and work party; no separate witness statement`,
      affected_person_name: affectedPerson,
      affected_person_organization: affectedPerson ? (contractorOrganization ?? 'StarNet Tech') : null,
      witness_name: witnessName,
      witness_organization: witnessName ? (contractorOrganization ?? 'StarNet Tech') : null,
      witness_contact_details: witnessName ? 'Contact recorded in site register' : null,
      contractor_involved: contractorInvolved,
      contractor_organization: contractorOrganization,
      potential_root_cause: potentialRootCause,
      investigation_status: investigationStatus,
      investigator_id: hasInvestigation ? choose(reporters, random).id : null,
      finding: hasInvestigation && chance(random, 0.57) ? choose(findings, random) : null,
      root_cause_statement: rootCause,
      contributing_factors: rootCause ? `${choose(causeFactors, random)}; ${choose(causeFactors, random)}` : null,
      correction_description: hasInvestigation && chance(random, 0.36) ? choose(correctionDescriptions, random) : null,
      containment_taken: hasInvestigation && chance(random, 0.36) ? choose(responses, random) : null,
      action_title: needsAction ? choose(actions[category], random) : null,
      action_description: needsAction ? `${choose(actions[category], random)}; verify the control during the next planned inspection.` : null,
      action_priority: severity === 'Critical' ? 'critical' : severity === 'High' ? 'high' : severity === 'Medium' ? 'medium' : 'low',
      action_status: actionStatus,
      action_owner_id: needsAction ? owner.id : null,
      action_due_date: needsAction ? dueDate : null,
    })
  }
  return rows
}

function validateGeneratedDates(rows: MockIncident[]) {
  const start = startDate.getTime()
  const exclusiveEnd = new Date('2026-09-30T00:00:00.000Z').getTime()
  const invalidRows = rows.flatMap((row) => {
    const occurredAt = Date.parse(String(row.occurred_at))
    const reportedAt = Date.parse(String(row.reported_at))
    const reasons: string[] = []
    if (!Number.isFinite(occurredAt) || occurredAt < start || occurredAt >= exclusiveEnd) reasons.push('occurred_at outside UTC range')
    if (!Number.isFinite(reportedAt) || reportedAt < start || reportedAt >= exclusiveEnd) reasons.push('reported_at outside UTC range')
    if (reportedAt < occurredAt) reasons.push('reported_at precedes occurred_at')
    return reasons.length ? [{ index: row.batch_index, occurredAt: row.occurred_at, reportedAt: row.reported_at, reasons }] : []
  })
  return invalidRows
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return respond({ error: 'POST is required' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const authorization = request.headers.get('Authorization')
  if (!url || !anonKey) return respond({ error: 'Incident seed service is not configured' }, 500)
  if (!authorization) return respond({ error: 'Authentication is required' }, 401)

  const client = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: { user }, error: authError } = await client.auth.getUser()
  if (authError || !user) return respond({ error: 'Invalid authentication token' }, 401)

  let body: { organizationId?: string; organizationCode?: string; batchId?: string }
  try {
    body = await request.json()
  } catch {
    return respond({ error: 'A valid JSON request body is required' }, 400)
  }
  if (body.organizationId !== organizationId || body.organizationCode !== organizationCode || body.batchId !== batchId) {
    return respond({ error: 'This endpoint only supports the approved StarNet Tech incident batch' }, 400)
  }

  const { data: membership, error: membershipError } = await client
    .from('memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', organizationId)
    .in('role', ['Super Administrator', 'Organization Administrator'])
    .maybeSingle()
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('account_status')
    .eq('id', user.id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (membershipError || profileError) return respond({ error: 'Unable to verify StarNet Tech administrator access' }, 403)
  if (!membership || profile?.account_status !== 'active') return respond({ error: 'An active StarNet Tech administrator is required' }, 403)

  const [
    { data: reporters, error: reportersError },
    { data: sites, error: sitesError },
    { data: facilities, error: facilitiesError },
    { data: settings, error: settingsError },
  ] = await Promise.all([
    client.from('profiles').select('id, full_name, department, employee_id').eq('organization_id', organizationId).eq('account_status', 'active').like('employee_id', 'MOCK-STARNET-20260930-%'),
    client.from('sites').select('id, name').eq('organization_id', organizationId),
    client.from('facilities').select('id, site_id, name').eq('organization_id', organizationId),
    client.from('company_settings').select('departments, operational_sites, incident_categories, severity_levels, working_hours').eq('organization_id', organizationId).single(),
  ])
  if (reportersError || sitesError || facilitiesError || settingsError) return respond({ error: 'Unable to load mock reporters, Settings, or site/facility assignments' }, 500)
  if (reporters?.length !== 20) return respond({ error: `Expected 20 active mock reporters, found ${reporters?.length ?? 0}` }, 400)
  if (!sites?.length || !facilities?.length) return respond({ error: 'Configured sites and facilities are required' }, 400)

  const requestedCategories = ['Oil/Chemical Spillage', 'Slip/Trip/Fall', 'Fire', 'Equipment Failure', 'Near Miss', 'Vehicle Incident', 'PPE Non-Compliance', 'Electrical Hazard', 'Dropped Object', 'Environmental Release']
  const requestedSeverities = ['Low', 'Medium', 'High', 'Critical']
  const requestedDepartments = ['Operations', 'Maintenance', 'Drilling', 'Logistics', 'Quality', 'HSE']
  const requestedShifts = ['Day', 'Afternoon', 'Night']
  const activeCategories = activeSettingNames(settings.incident_categories)
  const activeSeverities = activeSettingNames(settings.severity_levels)
  const activeDepartments = activeSettingNames(settings.departments)
  const activeShifts = activeSettingNames(settings.working_hours?.shifts)
  const activeSiteNames = activeSettingNames(settings.operational_sites)
  const missingSettings = [
    ...requestedCategories.filter((name) => !activeCategories.has(name.toLowerCase())).map((name) => `category:${name}`),
    ...requestedSeverities.filter((name) => !activeSeverities.has(name.toLowerCase())).map((name) => `severity:${name}`),
    ...requestedDepartments.filter((name) => !activeDepartments.has(name.toLowerCase())).map((name) => `department:${name}`),
    ...requestedShifts.filter((name) => !activeShifts.has(name.toLowerCase())).map((name) => `shift:${name}`),
  ]
  if (missingSettings.length) return respond({ error: 'Required settings are not active', missingSettings }, 400)

  const activeSites = (sites as Site[]).filter((site) => activeSiteNames.has(site.name.trim().toLowerCase()))
  if (!activeSites.length) return respond({ error: 'No active relational sites match operational_sites in Settings' }, 400)
  const rows = makeIncidentRows(reporters as Reporter[], activeSites, facilities as Facility[], {
    categories: requestedCategories,
    severities: requestedSeverities,
    departments: requestedDepartments,
    shifts: requestedShifts,
  })
  const datePreflightErrors = validateGeneratedDates(rows)
  if (datePreflightErrors.length) {
    return respond({ error: 'Date preflight rejected the batch before database writes', invalidRows: datePreflightErrors.slice(0, 10), invalidRowCount: datePreflightErrors.length }, 400)
  }

  const activeSiteIds = new Set(activeSites.map((site) => site.id))
  const activeFacilityPairs = new Set((facilities as Facility[]).filter((facility) => activeSiteIds.has(facility.site_id)).map((facility) => `${facility.site_id}:${facility.id}`))
  const settingsPreflightErrors = rows.flatMap((row) => {
    const invalidFields: string[] = []
    if (!activeSiteNames.has(String(row.site_id ? activeSites.find((site) => site.id === row.site_id)?.name : '').toLowerCase())) invalidFields.push('site')
    if (!activeFacilityPairs.has(`${row.site_id}:${row.facility_id}`)) invalidFields.push('facility/site')
    if (!activeDepartments.has(String(row.department).toLowerCase())) invalidFields.push(`department:${row.department}`)
    if (!activeShifts.has(String(row.shift).toLowerCase())) invalidFields.push(`shift:${row.shift}`)
    if (!activeCategories.has(String(row.incident_category).toLowerCase())) invalidFields.push(`category:${row.incident_category}`)
    if (!activeSeverities.has(String(row.severity).toLowerCase())) invalidFields.push(`severity:${row.severity}`)
    if (row.potential_severity && !activeSeverities.has(String(row.potential_severity).toLowerCase())) invalidFields.push(`potentialSeverity:${row.potential_severity}`)
    return invalidFields.length ? [{ index: row.batch_index, invalidFields }] : []
  })
  if (settingsPreflightErrors.length) {
    return respond({ error: 'Settings preflight rejected the batch before database writes', invalidRows: settingsPreflightErrors.slice(0, 10), invalidRowCount: settingsPreflightErrors.length }, 400)
  }

  const { data, error } = await client.rpc('seed_starnet_mock_incident_batch', { p_rows: rows })
  if (error) return respond({ error: error.message }, 400)
  return respond({
    batchId: data.batch_id,
    createdCount: data.created_count,
    alreadyExistingCount: data.existing_count,
    tableCounts: {
      incidents: data.incidents,
      incident_people: data.people,
      incident_evidence: data.evidence,
      activity_logs: data.activity_logs,
      investigations: data.investigations,
      investigation_findings: data.findings,
      investigation_root_causes: data.root_causes,
      investigation_corrections: data.investigation_corrections,
      corrective_actions: data.corrective_actions,
    },
    byStatus: data.by_status,
    bySeverity: data.by_severity,
    byCategory: data.by_category,
  })
})
