WITH demo_organizations AS (
  SELECT id, company_code, company_name
  FROM public.organizations
  WHERE company_code = 'SENTINEL-DEMO'
     OR (
       company_name = 'Sentinel Energy & Industrial Services Ltd'
       AND address LIKE 'DEMO DATA ONLY%'
     )
),
seeded_incidents AS (
  SELECT incident.*
  FROM public.incidents incident
  JOIN demo_organizations demo ON demo.id = incident.organization_id
  WHERE incident.digital_signature = 'DEMO-SEED:sentinelqhse-v1'
),
seeded_profiles AS (
  SELECT profile.*
  FROM public.profiles profile
  JOIN demo_organizations demo ON demo.id = profile.organization_id
  WHERE profile.employee_id LIKE 'DEMO-%'
),
seeded_actions AS (
  SELECT action.*
  FROM public.corrective_actions action
  JOIN demo_organizations demo ON demo.id = action.organization_id
  WHERE action.description LIKE 'SentinelQHSE demo seed v1:%'
)
SELECT 'Demo organisations' AS metric, count(*)::text AS value FROM demo_organizations
UNION ALL
SELECT 'Demo Auth users', count(*)::text
FROM auth.users auth_user
JOIN seeded_profiles profile ON profile.id = auth_user.id
WHERE auth_user.raw_user_meta_data->>'sentinel_demo' = 'true'
  AND auth_user.raw_app_meta_data->>'sentinel_demo' = 'true'
UNION ALL
SELECT 'Demo profiles', count(*)::text FROM seeded_profiles
UNION ALL
SELECT 'Submitted demo incidents', count(*)::text FROM seeded_incidents WHERE status <> 'draft'
UNION ALL
SELECT 'Demo drafts', count(*)::text FROM seeded_incidents WHERE status = 'draft'
UNION ALL
SELECT 'Demo corrective actions', count(*)::text FROM seeded_actions
UNION ALL
SELECT 'Demo investigations', count(*)::text
FROM public.investigations investigation
JOIN demo_organizations demo ON demo.id = investigation.organization_id
JOIN seeded_incidents incident ON incident.id = investigation.incident_id
UNION ALL
SELECT 'Demo incident people links', count(*)::text
FROM public.incident_people person
JOIN demo_organizations demo ON demo.id = person.organization_id
JOIN seeded_incidents incident ON incident.id = person.incident_id
UNION ALL
SELECT 'Demo activity log rows', count(*)::text
FROM public.activity_logs activity
JOIN demo_organizations demo ON demo.id = activity.organization_id
WHERE activity.metadata->>'demo_seed' = 'sentinelqhse-v1'
UNION ALL
SELECT 'Demo notification preferences', count(*)::text
FROM public.notification_preferences preference
JOIN seeded_profiles profile ON profile.id = preference.user_id;

SELECT 'Unmarked legacy DEMO-INC records (seed will refuse to duplicate)' AS metric,
       count(*) AS record_count
FROM public.incidents incident
JOIN public.organizations organization ON organization.id = incident.organization_id
WHERE (
  organization.company_code = 'SENTINEL-DEMO'
  OR (
    organization.company_name = 'Sentinel Energy & Industrial Services Ltd'
    AND organization.address LIKE 'DEMO DATA ONLY%'
  )
)
  AND incident.reference_number LIKE 'DEMO-INC-%'
  AND incident.digital_signature IS DISTINCT FROM 'DEMO-SEED:sentinelqhse-v1';

WITH demo_organizations AS (
  SELECT id FROM public.organizations
  WHERE company_code = 'SENTINEL-DEMO'
     OR (company_name = 'Sentinel Energy & Industrial Services Ltd' AND address LIKE 'DEMO DATA ONLY%')
)
SELECT extract(year FROM incident.occurred_at)::integer AS year, count(*) AS incident_count
FROM public.incidents incident
JOIN demo_organizations demo ON demo.id = incident.organization_id
WHERE incident.digital_signature = 'DEMO-SEED:sentinelqhse-v1'
  AND incident.status <> 'draft'
GROUP BY 1
ORDER BY 1;

WITH demo_organizations AS (
  SELECT id FROM public.organizations
  WHERE company_code = 'SENTINEL-DEMO'
     OR (company_name = 'Sentinel Energy & Industrial Services Ltd' AND address LIKE 'DEMO DATA ONLY%')
)
SELECT to_char(date_trunc('month', incident.occurred_at), 'YYYY-MM') AS month,
       count(*) AS incident_count
FROM public.incidents incident
JOIN demo_organizations demo ON demo.id = incident.organization_id
WHERE incident.digital_signature = 'DEMO-SEED:sentinelqhse-v1'
  AND incident.status <> 'draft'
GROUP BY 1
ORDER BY 1;

WITH demo_organizations AS (
  SELECT id FROM public.organizations
  WHERE company_code = 'SENTINEL-DEMO'
     OR (company_name = 'Sentinel Energy & Industrial Services Ltd' AND address LIKE 'DEMO DATA ONLY%')
)
SELECT extract(year FROM incident.occurred_at)::integer AS year,
       extract(quarter FROM incident.occurred_at)::integer AS quarter,
       count(*) AS incident_count
FROM public.incidents incident
JOIN demo_organizations demo ON demo.id = incident.organization_id
WHERE incident.digital_signature = 'DEMO-SEED:sentinelqhse-v1'
  AND incident.status <> 'draft'
GROUP BY 1, 2
ORDER BY 1, 2;

WITH demo_organizations AS (
  SELECT id FROM public.organizations
  WHERE company_code = 'SENTINEL-DEMO'
     OR (company_name = 'Sentinel Energy & Industrial Services Ltd' AND address LIKE 'DEMO DATA ONLY%')
)
SELECT incident.incident_category, count(*) AS incident_count
FROM public.incidents incident
JOIN demo_organizations demo ON demo.id = incident.organization_id
WHERE incident.digital_signature = 'DEMO-SEED:sentinelqhse-v1'
  AND incident.status <> 'draft'
GROUP BY incident.incident_category
ORDER BY incident_count DESC, incident.incident_category;

WITH demo_organizations AS (
  SELECT id FROM public.organizations
  WHERE company_code = 'SENTINEL-DEMO'
     OR (company_name = 'Sentinel Energy & Industrial Services Ltd' AND address LIKE 'DEMO DATA ONLY%')
)
SELECT incident.report_type, count(*) AS incident_count
FROM public.incidents incident
JOIN demo_organizations demo ON demo.id = incident.organization_id
WHERE incident.digital_signature = 'DEMO-SEED:sentinelqhse-v1'
  AND incident.status <> 'draft'
GROUP BY incident.report_type
ORDER BY incident_count DESC, incident.report_type;

WITH demo_organizations AS (
  SELECT id FROM public.organizations
  WHERE company_code = 'SENTINEL-DEMO'
     OR (company_name = 'Sentinel Energy & Industrial Services Ltd' AND address LIKE 'DEMO DATA ONLY%')
)
SELECT incident.severity, count(*) AS incident_count
FROM public.incidents incident
JOIN demo_organizations demo ON demo.id = incident.organization_id
WHERE incident.digital_signature = 'DEMO-SEED:sentinelqhse-v1'
  AND incident.status <> 'draft'
GROUP BY incident.severity
ORDER BY incident_count DESC, incident.severity;

WITH demo_organizations AS (
  SELECT id FROM public.organizations
  WHERE company_code = 'SENTINEL-DEMO'
     OR (company_name = 'Sentinel Energy & Industrial Services Ltd' AND address LIKE 'DEMO DATA ONLY%')
)
SELECT incident.status, count(*) AS incident_count
FROM public.incidents incident
JOIN demo_organizations demo ON demo.id = incident.organization_id
WHERE incident.digital_signature = 'DEMO-SEED:sentinelqhse-v1'
GROUP BY incident.status
ORDER BY incident.status;

WITH demo_organizations AS (
  SELECT id FROM public.organizations
  WHERE company_code = 'SENTINEL-DEMO'
     OR (company_name = 'Sentinel Energy & Industrial Services Ltd' AND address LIKE 'DEMO DATA ONLY%')
)
SELECT incident.department, count(*) AS incident_count
FROM public.incidents incident
JOIN demo_organizations demo ON demo.id = incident.organization_id
WHERE incident.digital_signature = 'DEMO-SEED:sentinelqhse-v1'
  AND incident.status <> 'draft'
GROUP BY incident.department
ORDER BY incident_count DESC, incident.department;

WITH demo_organizations AS (
  SELECT id FROM public.organizations
  WHERE company_code = 'SENTINEL-DEMO'
     OR (company_name = 'Sentinel Energy & Industrial Services Ltd' AND address LIKE 'DEMO DATA ONLY%')
)
SELECT site.name AS site, count(*) AS incident_count
FROM public.incidents incident
JOIN public.sites site
  ON site.id = incident.site_id
 AND site.organization_id = incident.organization_id
JOIN demo_organizations demo ON demo.id = incident.organization_id
WHERE incident.digital_signature = 'DEMO-SEED:sentinelqhse-v1'
  AND incident.status <> 'draft'
GROUP BY site.name
ORDER BY incident_count DESC, site.name;

WITH demo_organizations AS (
  SELECT id FROM public.organizations
  WHERE company_code = 'SENTINEL-DEMO'
     OR (company_name = 'Sentinel Energy & Industrial Services Ltd' AND address LIKE 'DEMO DATA ONLY%')
)
SELECT incident.shift, count(*) AS incident_count
FROM public.incidents incident
JOIN demo_organizations demo ON demo.id = incident.organization_id
WHERE incident.digital_signature = 'DEMO-SEED:sentinelqhse-v1'
  AND incident.status <> 'draft'
GROUP BY incident.shift
ORDER BY incident_count DESC, incident.shift;

WITH demo_organizations AS (
  SELECT id FROM public.organizations
  WHERE company_code = 'SENTINEL-DEMO'
     OR (company_name = 'Sentinel Energy & Industrial Services Ltd' AND address LIKE 'DEMO DATA ONLY%')
)
SELECT incident.status, count(*) AS open_incident_count
FROM public.incidents incident
JOIN demo_organizations demo ON demo.id = incident.organization_id
WHERE incident.digital_signature = 'DEMO-SEED:sentinelqhse-v1'
  AND incident.status NOT IN ('draft', 'closed')
GROUP BY incident.status
ORDER BY incident.status;

WITH demo_organizations AS (
  SELECT id FROM public.organizations
  WHERE company_code = 'SENTINEL-DEMO'
     OR (company_name = 'Sentinel Energy & Industrial Services Ltd' AND address LIKE 'DEMO DATA ONLY%')
)
SELECT action.status, count(*) AS corrective_action_count
FROM public.corrective_actions action
JOIN demo_organizations demo ON demo.id = action.organization_id
WHERE action.description LIKE 'SentinelQHSE demo seed v1:%'
GROUP BY action.status
ORDER BY action.status;

WITH demo_organizations AS (
  SELECT id FROM public.organizations
  WHERE company_code = 'SENTINEL-DEMO'
     OR (company_name = 'Sentinel Energy & Industrial Services Ltd' AND address LIKE 'DEMO DATA ONLY%')
)
SELECT 'Closed incidents' AS metric, count(*) AS record_count
FROM public.incidents incident
JOIN demo_organizations demo ON demo.id = incident.organization_id
WHERE incident.digital_signature = 'DEMO-SEED:sentinelqhse-v1'
  AND incident.status = 'closed'
UNION ALL
SELECT 'All open incidents', count(*)
FROM public.incidents incident
JOIN demo_organizations demo ON demo.id = incident.organization_id
WHERE incident.digital_signature = 'DEMO-SEED:sentinelqhse-v1'
  AND incident.status NOT IN ('draft', 'closed')
UNION ALL
SELECT 'Overdue corrective actions', count(*)
FROM public.corrective_actions action
JOIN demo_organizations demo ON demo.id = action.organization_id
WHERE action.description LIKE 'SentinelQHSE demo seed v1:%'
  AND action.due_date < current_date
  AND action.status NOT IN ('verified', 'closed', 'rejected');

WITH demo_organizations AS (
  SELECT id FROM public.organizations
  WHERE company_code = 'SENTINEL-DEMO'
     OR (company_name = 'Sentinel Energy & Industrial Services Ltd' AND address LIKE 'DEMO DATA ONLY%')
),
seeded_profiles AS (
  SELECT profile.*
  FROM public.profiles profile
  JOIN demo_organizations demo ON demo.id = profile.organization_id
  WHERE profile.employee_id LIKE 'DEMO-%'
),
seeded_incidents AS (
  SELECT incident.*
  FROM public.incidents incident
  JOIN demo_organizations demo ON demo.id = incident.organization_id
  WHERE incident.digital_signature = 'DEMO-SEED:sentinelqhse-v1'
),
seeded_actions AS (
  SELECT action.*
  FROM public.corrective_actions action
  JOIN demo_organizations demo ON demo.id = action.organization_id
  WHERE action.description LIKE 'SentinelQHSE demo seed v1:%'
)
SELECT 'Profiles missing Auth user' AS check_name, count(*) AS invalid_count
FROM seeded_profiles profile
LEFT JOIN auth.users auth_user ON auth_user.id = profile.id
WHERE auth_user.id IS NULL
UNION ALL
SELECT 'Profiles missing organization', count(*)
FROM seeded_profiles profile
LEFT JOIN demo_organizations demo ON demo.id = profile.organization_id
WHERE demo.id IS NULL
UNION ALL
SELECT 'Profiles without membership', count(*)
FROM seeded_profiles profile
LEFT JOIN public.memberships membership
  ON membership.user_id = profile.id
 AND membership.organization_id = profile.organization_id
WHERE membership.user_id IS NULL
UNION ALL
SELECT 'Incidents with orphan organization/reporter/creator/site/facility', count(*)
FROM seeded_incidents incident
LEFT JOIN public.organizations organization ON organization.id = incident.organization_id
LEFT JOIN auth.users reporter ON reporter.id = incident.reported_by
LEFT JOIN auth.users creator ON creator.id = incident.created_by
LEFT JOIN public.sites site
  ON site.id = incident.site_id
 AND site.organization_id = incident.organization_id
LEFT JOIN public.facilities facility
  ON facility.id = incident.facility_id
 AND facility.organization_id = incident.organization_id
WHERE organization.id IS NULL
   OR reporter.id IS NULL
   OR creator.id IS NULL
   OR (incident.site_id IS NOT NULL AND site.id IS NULL)
   OR (incident.facility_id IS NOT NULL AND facility.id IS NULL)
UNION ALL
SELECT 'Investigations with orphan incident/profile references', count(*)
FROM public.investigations investigation
JOIN demo_organizations demo ON demo.id = investigation.organization_id
LEFT JOIN public.incidents incident
  ON incident.id = investigation.incident_id
 AND incident.organization_id = investigation.organization_id
LEFT JOIN public.profiles investigator
  ON investigator.id = investigation.assigned_investigator_id
 AND investigator.organization_id = investigation.organization_id
LEFT JOIN public.profiles lead
  ON lead.id = investigation.investigation_lead_id
 AND lead.organization_id = investigation.organization_id
LEFT JOIN public.profiles creator
  ON creator.id = investigation.created_by
 AND creator.organization_id = investigation.organization_id
WHERE incident.id IS NULL
   OR (investigation.assigned_investigator_id IS NOT NULL AND investigator.id IS NULL)
   OR (investigation.investigation_lead_id IS NOT NULL AND lead.id IS NULL)
   OR creator.id IS NULL
UNION ALL
SELECT 'Corrective actions with orphan incident/profile references', count(*)
FROM seeded_actions action
LEFT JOIN public.incidents incident
  ON incident.id = action.incident_id
 AND incident.organization_id = action.organization_id
LEFT JOIN public.profiles owner
  ON owner.id = action.assigned_owner_id
 AND owner.organization_id = action.organization_id
LEFT JOIN public.profiles creator
  ON creator.id = action.created_by
 AND creator.organization_id = action.organization_id
LEFT JOIN public.profiles verifier
  ON verifier.id = action.verified_by
 AND verifier.organization_id = action.organization_id
WHERE incident.id IS NULL
   OR (action.assigned_owner_id IS NOT NULL AND owner.id IS NULL)
   OR creator.id IS NULL
   OR (action.verified_by IS NOT NULL AND verifier.id IS NULL)
UNION ALL
SELECT 'Incident people with orphan incident/profile references', count(*)
FROM public.incident_people person
JOIN demo_organizations demo ON demo.id = person.organization_id
LEFT JOIN public.incidents incident
  ON incident.id = person.incident_id
 AND incident.organization_id = person.organization_id
LEFT JOIN public.profiles profile
  ON profile.id = person.profile_id
 AND profile.organization_id = person.organization_id
WHERE incident.id IS NULL
   OR (person.profile_id IS NOT NULL AND profile.id IS NULL);

SELECT 'Corrective actions with orphan investigation links' AS check_name, count(*) AS invalid_count
FROM public.corrective_actions action
JOIN public.organizations organization ON organization.id = action.organization_id
LEFT JOIN public.investigations investigation
  ON investigation.id = action.investigation_id
 AND investigation.organization_id = action.organization_id
WHERE (
  organization.company_code = 'SENTINEL-DEMO'
  OR (
    organization.company_name = 'Sentinel Energy & Industrial Services Ltd'
    AND organization.address LIKE 'DEMO DATA ONLY%'
  )
)
  AND action.description LIKE 'SentinelQHSE demo seed v1:%'
  AND action.investigation_id IS NOT NULL
  AND investigation.id IS NULL;

SELECT 'Demo sites with orphan organization' AS check_name, count(*) AS invalid_count
FROM public.sites site
LEFT JOIN public.organizations organization ON organization.id = site.organization_id
WHERE site.code LIKE 'DEMO-%'
  AND organization.id IS NULL
UNION ALL
SELECT 'Demo facilities with orphan organization/site', count(*)
FROM public.facilities facility
LEFT JOIN public.organizations organization ON organization.id = facility.organization_id
LEFT JOIN public.sites site
  ON site.id = facility.site_id
 AND site.organization_id = facility.organization_id
WHERE facility.code LIKE 'DEMO-%'
  AND (organization.id IS NULL OR site.id IS NULL);

WITH demo_organizations AS (
  SELECT id FROM public.organizations
  WHERE company_code = 'SENTINEL-DEMO'
     OR (company_name = 'Sentinel Energy & Industrial Services Ltd' AND address LIKE 'DEMO DATA ONLY%')
)
SELECT 'Demo activity rows with orphan incident metadata' AS check_name, count(*) AS invalid_count
FROM public.activity_logs activity
JOIN demo_organizations demo ON demo.id = activity.organization_id
LEFT JOIN public.incidents incident
  ON incident.id::text = activity.metadata->>'incident_id'
 AND incident.organization_id = activity.organization_id
WHERE activity.metadata->>'demo_seed' = 'sentinelqhse-v1'
  AND incident.id IS NULL;
