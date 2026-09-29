WITH demo AS (
  SELECT id
  FROM public.organizations
  WHERE company_code = 'SENTINEL-DEMO'
),
seeded_incidents AS (
  SELECT incident.*
  FROM public.incidents incident
  JOIN demo ON demo.id = incident.organization_id
  WHERE incident.reference_number LIKE 'DEMO-INC-%'
),
seeded_drafts AS (
  SELECT incident.*
  FROM public.incidents incident
  JOIN demo ON demo.id = incident.organization_id
  WHERE incident.reference_number LIKE 'DEMO-DRAFT-%'
),
seeded_profiles AS (
  SELECT profile.*
  FROM public.profiles profile
  JOIN demo ON demo.id = profile.organization_id
  WHERE profile.employee_id LIKE 'DEMO-%'
)
SELECT 'DEMO ORGANIZATIONS' AS metric, count(*)::text AS value FROM demo
UNION ALL
SELECT 'DEMO USER PROFILES', count(*)::text FROM seeded_profiles
UNION ALL
SELECT 'DEMO INCIDENTS (NON-DRAFT)', count(*)::text FROM seeded_incidents
UNION ALL
SELECT 'DEMO DRAFTS', count(*)::text FROM seeded_drafts
UNION ALL
SELECT 'DEMO NEAR MISSES', count(*)::text FROM seeded_incidents WHERE report_type='near_miss'
UNION ALL
SELECT 'DEMO HIGH/CRITICAL SEVERITY', count(*)::text FROM seeded_incidents WHERE severity IN ('High', 'Critical')
UNION ALL
SELECT 'DEMO OPEN INCIDENTS', count(*)::text FROM seeded_incidents WHERE status <> 'closed'
UNION ALL
SELECT 'DEMO CLOSED INCIDENTS', count(*)::text FROM seeded_incidents WHERE status='closed'
UNION ALL
SELECT 'DEMO INVESTIGATIONS', count(*)::text
FROM public.investigations investigation JOIN demo ON demo.id = investigation.organization_id
JOIN seeded_incidents incident ON incident.id = investigation.incident_id
UNION ALL
SELECT 'DEMO INCIDENT PEOPLE LINKS', count(*)::text
FROM public.incident_people person JOIN demo ON demo.id = person.organization_id
JOIN seeded_incidents incident ON incident.id = person.incident_id
UNION ALL
SELECT 'DEMO ACTIVITY LOG ROWS', count(*)::text
FROM public.activity_logs activity JOIN demo ON demo.id = activity.organization_id
WHERE activity.metadata->>'incident_id' IN (SELECT id::text FROM seeded_incidents)
UNION ALL
SELECT 'CORRECTIVE ACTION TABLE', CASE WHEN to_regclass('public.corrective_actions') IS NULL THEN 'NOT PRESENT IN MIGRATED SCHEMA' ELSE 'PRESENT' END;

SELECT extract(year FROM incident.occurred_at)::integer AS year, count(*) AS incident_count
FROM public.incidents incident JOIN public.organizations organization ON organization.id=incident.organization_id
WHERE organization.company_code='SENTINEL-DEMO' AND incident.reference_number LIKE 'DEMO-INC-%' AND incident.status <> 'draft'
GROUP BY 1
ORDER BY 1;

SELECT to_char(date_trunc('month', incident.occurred_at), 'YYYY-MM') AS month, count(*) AS incident_count
FROM public.incidents incident JOIN public.organizations organization ON organization.id=incident.organization_id
WHERE organization.company_code='SENTINEL-DEMO' AND incident.reference_number LIKE 'DEMO-INC-%' AND incident.status <> 'draft'
GROUP BY 1
ORDER BY 1;

SELECT extract(year FROM incident.occurred_at)::integer AS year,
       extract(quarter FROM incident.occurred_at)::integer AS quarter,
       count(*) AS incident_count
FROM public.incidents incident JOIN public.organizations organization ON organization.id=incident.organization_id
WHERE organization.company_code='SENTINEL-DEMO' AND incident.reference_number LIKE 'DEMO-INC-%' AND incident.status <> 'draft'
GROUP BY 1, 2
ORDER BY 1, 2;

SELECT incident.incident_category, count(*) AS incident_count
FROM public.incidents incident JOIN public.organizations organization ON organization.id=incident.organization_id
WHERE organization.company_code='SENTINEL-DEMO' AND incident.reference_number LIKE 'DEMO-INC-%' AND incident.status <> 'draft'
GROUP BY incident.incident_category
ORDER BY incident_count DESC, incident.incident_category;

SELECT incident.severity, count(*) AS incident_count
FROM public.incidents incident JOIN public.organizations organization ON organization.id=incident.organization_id
WHERE organization.company_code='SENTINEL-DEMO' AND incident.reference_number LIKE 'DEMO-INC-%' AND incident.status <> 'draft'
GROUP BY incident.severity
ORDER BY incident_count DESC, incident.severity;

SELECT incident.status, count(*) AS incident_count
FROM public.incidents incident JOIN public.organizations organization ON organization.id=incident.organization_id
WHERE organization.company_code='SENTINEL-DEMO' AND incident.reference_number LIKE 'DEMO-INC-%'
GROUP BY incident.status
ORDER BY incident.status;

SELECT incident.department, count(*) AS incident_count
FROM public.incidents incident JOIN public.organizations organization ON organization.id=incident.organization_id
WHERE organization.company_code='SENTINEL-DEMO' AND incident.reference_number LIKE 'DEMO-INC-%' AND incident.status <> 'draft'
GROUP BY incident.department
ORDER BY incident_count DESC, incident.department;

SELECT site.name AS site, count(*) AS incident_count
FROM public.incidents incident
JOIN public.sites site ON site.id = incident.site_id AND site.organization_id = incident.organization_id
JOIN public.organizations organization ON organization.id=incident.organization_id
WHERE organization.company_code='SENTINEL-DEMO' AND incident.reference_number LIKE 'DEMO-INC-%' AND incident.status <> 'draft'
GROUP BY site.name
ORDER BY incident_count DESC, site.name;

SELECT incident.shift, count(*) AS incident_count
FROM public.incidents incident JOIN public.organizations organization ON organization.id=incident.organization_id
WHERE organization.company_code='SENTINEL-DEMO' AND incident.reference_number LIKE 'DEMO-INC-%' AND incident.status <> 'draft'
GROUP BY incident.shift
ORDER BY incident_count DESC, incident.shift;

SELECT investigation.status, count(*) AS investigation_count
FROM public.investigations investigation
JOIN public.organizations organization ON organization.id=investigation.organization_id
JOIN public.incidents incident ON incident.id=investigation.incident_id AND incident.organization_id=investigation.organization_id
WHERE organization.company_code='SENTINEL-DEMO'
  AND incident.reference_number LIKE 'DEMO-INC-%'
GROUP BY investigation.status
ORDER BY investigation.status;

WITH demo AS (SELECT id FROM public.organizations WHERE company_code='SENTINEL-DEMO'),
seeded_profiles AS (
  SELECT profile.* FROM public.profiles profile JOIN demo ON demo.id=profile.organization_id WHERE profile.employee_id LIKE 'DEMO-%'
),
seeded_incidents AS (
  SELECT incident.* FROM public.incidents incident JOIN demo ON demo.id=incident.organization_id WHERE incident.reference_number LIKE 'DEMO-INC-%'
)
SELECT 'ORPHAN DEMO PROFILES' AS check_name, count(*) AS invalid_count
FROM seeded_profiles profile
LEFT JOIN auth.users auth_user ON auth_user.id = profile.id
LEFT JOIN public.organizations organization ON organization.id = profile.organization_id
WHERE auth_user.id IS NULL OR organization.id IS NULL
UNION ALL
SELECT 'ORPHAN DEMO MEMBERSHIPS', count(*)
FROM public.memberships membership
JOIN demo ON demo.id = membership.organization_id
JOIN seeded_profiles profile ON profile.id = membership.user_id
LEFT JOIN auth.users auth_user ON auth_user.id = membership.user_id
WHERE auth_user.id IS NULL
UNION ALL
SELECT 'DEMO PROFILES WITHOUT MEMBERSHIP', count(*)
FROM seeded_profiles profile
LEFT JOIN public.memberships membership ON membership.user_id=profile.id AND membership.organization_id=profile.organization_id
WHERE membership.user_id IS NULL
UNION ALL
SELECT 'ORPHAN DEMO SITES', count(*)
FROM public.sites site
JOIN demo ON demo.id = site.organization_id
LEFT JOIN public.organizations organization ON organization.id = site.organization_id
WHERE organization.id IS NULL
UNION ALL
SELECT 'ORPHAN DEMO INCIDENTS', count(*)
FROM seeded_incidents incident
LEFT JOIN public.organizations organization ON organization.id = incident.organization_id
LEFT JOIN auth.users reporter ON reporter.id = incident.reported_by
LEFT JOIN auth.users creator ON creator.id = incident.created_by
LEFT JOIN public.sites site ON site.id = incident.site_id AND site.organization_id = incident.organization_id
LEFT JOIN public.facilities facility ON facility.id = incident.facility_id AND facility.organization_id = incident.organization_id
WHERE organization.id IS NULL OR reporter.id IS NULL OR creator.id IS NULL OR site.id IS NULL OR facility.id IS NULL
UNION ALL
SELECT 'ORPHAN DEMO INVESTIGATIONS', count(*)
FROM public.investigations investigation
JOIN demo ON demo.id = investigation.organization_id
JOIN seeded_incidents incident ON incident.id = investigation.incident_id
LEFT JOIN public.profiles assigned ON assigned.id = investigation.assigned_investigator_id AND assigned.organization_id = investigation.organization_id
LEFT JOIN public.profiles lead ON lead.id = investigation.investigation_lead_id AND lead.organization_id = investigation.organization_id
LEFT JOIN public.profiles creator ON creator.id = investigation.created_by AND creator.organization_id = investigation.organization_id
WHERE assigned.id IS NULL OR lead.id IS NULL OR creator.id IS NULL
UNION ALL
SELECT 'ORPHAN DEMO INCIDENT PEOPLE', count(*)
FROM public.incident_people person
JOIN demo ON demo.id = person.organization_id
JOIN seeded_incidents incident ON incident.id = person.incident_id
LEFT JOIN public.profiles profile ON profile.id = person.profile_id AND profile.organization_id = person.organization_id
WHERE person.profile_id IS NOT NULL AND profile.id IS NULL;

SELECT 'CORRECTIVE ACTIONS' AS metric, 'Not supported by this schema; no corrective-action table exists.' AS result;
SELECT 'OVERDUE CORRECTIVE ACTIONS' AS metric, 'Not measurable; no corrective-action table or due-date records exist.' AS result;
