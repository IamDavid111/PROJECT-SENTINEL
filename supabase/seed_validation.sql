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
SELECT min(incident.occurred_at) AS first_incident,
       max(incident.occurred_at) AS last_incident,
       min(incident.reported_at) AS first_reported,
       max(incident.reported_at) AS last_reported
FROM public.incidents incident
JOIN demo_organizations demo ON demo.id = incident.organization_id
WHERE incident.digital_signature = 'DEMO-SEED:sentinelqhse-v1'
  AND incident.status <> 'draft';

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

DO $validate_demo_seed$
DECLARE
  demo_organization_id uuid;
  demo_organization_count integer;
  demo_profile_count integer;
  demo_auth_count integer;
  submitted_incident_count integer;
  draft_count integer;
  investigation_count integer;
  corrective_action_count integer;
  verified_corrective_action_count integer;
  invalid_verified_corrective_action_count integer;
  marked_incident_count integer;
  orphan_count integer;
  rls_problem_count integer;
BEGIN
  SELECT count(*) INTO demo_organization_count
  FROM public.organizations
  WHERE company_code = 'SENTINEL-DEMO'
     OR (company_name = 'Sentinel Energy & Industrial Services Ltd' AND address LIKE 'DEMO DATA ONLY%');
  IF demo_organization_count <> 1 THEN
    RAISE EXCEPTION 'Expected one clearly marked demo organization; found %.', demo_organization_count;
  END IF;
  SELECT id INTO demo_organization_id
  FROM public.organizations
  WHERE company_code = 'SENTINEL-DEMO'
     OR (company_name = 'Sentinel Energy & Industrial Services Ltd' AND address LIKE 'DEMO DATA ONLY%');

  SELECT count(*) INTO demo_profile_count
  FROM public.profiles
  WHERE organization_id = demo_organization_id AND employee_id LIKE 'DEMO-%';
  SELECT count(*) INTO demo_auth_count
  FROM public.profiles profile
  JOIN auth.users auth_user ON auth_user.id = profile.id
  WHERE profile.organization_id = demo_organization_id
    AND profile.employee_id LIKE 'DEMO-%'
    AND auth_user.raw_user_meta_data->>'sentinel_demo' = 'true'
    AND auth_user.raw_app_meta_data->>'sentinel_demo' = 'true'
    AND auth_user.email_confirmed_at IS NOT NULL
    AND auth_user.raw_user_meta_data->>'full_name' = profile.full_name;
  IF demo_profile_count <> 20 OR demo_auth_count <> 20 THEN
    RAISE EXCEPTION 'Expected 20 demo profiles backed by 20 confirmed, marked Auth users; found % profiles and % Auth users.', demo_profile_count, demo_auth_count;
  END IF;

  IF (SELECT count(*) FROM public.memberships
      WHERE organization_id = demo_organization_id) <> 20
     OR (SELECT count(*) FROM public.notification_preferences preference
         JOIN public.profiles profile ON profile.id = preference.user_id
         WHERE profile.organization_id = demo_organization_id
           AND profile.employee_id LIKE 'DEMO-%') <> 20 THEN
    RAISE EXCEPTION 'Expected 20 demo memberships and notification-preference rows.';
  END IF;

  IF (SELECT count(*) FROM public.memberships
      WHERE organization_id = demo_organization_id AND role = 'Super Administrator') <> 1
     OR (SELECT count(*) FROM public.memberships
         WHERE organization_id = demo_organization_id AND role = 'QHSE Manager') <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Super Administrator and one QHSE Manager demo membership.';
  END IF;

  SELECT count(*) INTO marked_incident_count
  FROM public.incidents
  WHERE organization_id = demo_organization_id
    AND digital_signature = 'DEMO-SEED:sentinelqhse-v1';
  SELECT count(*) INTO submitted_incident_count
  FROM public.incidents
  WHERE organization_id = demo_organization_id
    AND digital_signature = 'DEMO-SEED:sentinelqhse-v1'
    AND status <> 'draft';
  SELECT count(*) INTO draft_count
  FROM public.incidents
  WHERE organization_id = demo_organization_id
    AND digital_signature = 'DEMO-SEED:sentinelqhse-v1'
    AND status = 'draft';
  SELECT count(*) INTO investigation_count
  FROM public.investigations investigation
  JOIN public.incidents incident
    ON incident.id = investigation.incident_id
   AND incident.organization_id = investigation.organization_id
  WHERE investigation.organization_id = demo_organization_id
    AND incident.digital_signature = 'DEMO-SEED:sentinelqhse-v1';
  SELECT count(*) INTO corrective_action_count
  FROM public.corrective_actions
  WHERE organization_id = demo_organization_id
    AND description LIKE 'SentinelQHSE demo seed v1:%';
  IF marked_incident_count <> 1215 OR submitted_incident_count <> 1200 OR draft_count <> 15
     OR investigation_count <> 960 OR corrective_action_count <> 900 THEN
    RAISE EXCEPTION 'Demo count mismatch: marked incidents %, submitted incidents %, drafts %, investigations %, corrective actions %.',
      marked_incident_count, submitted_incident_count, draft_count, investigation_count, corrective_action_count;
  END IF;

  SELECT count(*) INTO verified_corrective_action_count
  FROM public.corrective_actions
  WHERE organization_id = demo_organization_id
    AND description LIKE 'SentinelQHSE demo seed v1:%'
    AND status = 'verified';
  IF verified_corrective_action_count <> 539 THEN
    RAISE EXCEPTION 'Expected 539 verified demo corrective actions; found %.', verified_corrective_action_count;
  END IF;

  SELECT count(*) INTO invalid_verified_corrective_action_count
  FROM public.corrective_actions action
  LEFT JOIN public.profiles owner
    ON owner.id = action.assigned_owner_id
   AND owner.organization_id = action.organization_id
  LEFT JOIN public.profiles verifier
    ON verifier.id = action.verified_by
   AND verifier.organization_id = action.organization_id
  LEFT JOIN public.memberships owner_membership
    ON owner_membership.user_id = action.assigned_owner_id
   AND owner_membership.organization_id = action.organization_id
  LEFT JOIN public.memberships verifier_membership
    ON verifier_membership.user_id = action.verified_by
   AND verifier_membership.organization_id = action.organization_id
  WHERE action.organization_id = demo_organization_id
    AND action.description LIKE 'SentinelQHSE demo seed v1:%'
    AND action.status = 'verified'
    AND (
      action.verification_status IS DISTINCT FROM 'approved'
      OR action.assigned_owner_id IS NULL
      OR action.verified_by IS NULL
      OR action.assigned_owner_id = action.verified_by
      OR owner.id IS NULL
      OR verifier.id IS NULL
      OR owner_membership.user_id IS NULL
      OR owner_membership.role NOT IN ('QHSE Manager', 'Safety Officer / HSE Officer')
      OR verifier_membership.user_id IS NULL
      OR verifier_membership.role NOT IN ('QHSE Manager', 'Safety Officer / HSE Officer')
    );
  IF invalid_verified_corrective_action_count <> 0 THEN
    RAISE EXCEPTION 'Found % verified demo corrective actions with invalid approval, owner/verifier, profile, organization, or QHSE-role data.', invalid_verified_corrective_action_count;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.company_settings WHERE organization_id = demo_organization_id)
     OR EXISTS (
       SELECT 1 FROM (VALUES
         ('departments', 'HSE'), ('departments', 'Operations'), ('departments', 'Maintenance'),
         ('departments', 'Engineering'), ('departments', 'Procurement'),
         ('departments', 'Human Resources'), ('departments', 'Finance'), ('departments', 'Security'),
         ('departments', 'Logistics'), ('departments', 'Administration'),
         ('operational_sites', 'Lagos Head Office'), ('operational_sites', 'Port Harcourt Operations Base'),
         ('operational_sites', 'Onne Logistics Base'), ('operational_sites', 'Warri Field Operations'),
         ('operational_sites', 'Bonny Operations Site'), ('operational_sites', 'Yenagoa Field Office'),
         ('operational_sites', 'Escravos Operations Site'), ('operational_sites', 'Calabar Support Base'),
         ('incident_categories', 'Incident'), ('incident_categories', 'Near Miss'),
         ('incident_categories', 'Unsafe Act'), ('incident_categories', 'Unsafe Condition'),
         ('incident_categories', 'Environmental Incident'), ('incident_categories', 'Injury / Illness'),
         ('incident_categories', 'Vehicle / Transportation Incident'), ('incident_categories', 'Fire / Explosion'),
         ('incident_categories', 'Property / Equipment Damage'), ('incident_categories', 'Process Safety Incident'),
         ('incident_categories', 'Security Incident'), ('incident_categories', 'Occupational Health'),
         ('incident_categories', 'Chemical / Hazardous Substance'), ('incident_categories', 'Electrical Incident'),
         ('incident_categories', 'Lifting / Dropped Object'), ('incident_categories', 'Confined Space'),
         ('incident_categories', 'Working at Height'),
         ('severity_levels', 'low'), ('severity_levels', 'medium'),
         ('severity_levels', 'high'), ('severity_levels', 'critical')
       ) AS expected(setting_key, setting_name)
       WHERE NOT public.company_setting_has_active_name(
         CASE setting_key
           WHEN 'departments' THEN (SELECT departments FROM public.company_settings WHERE organization_id = demo_organization_id)
           WHEN 'operational_sites' THEN (SELECT operational_sites FROM public.company_settings WHERE organization_id = demo_organization_id)
           WHEN 'incident_categories' THEN (SELECT incident_categories FROM public.company_settings WHERE organization_id = demo_organization_id)
           ELSE (SELECT severity_levels FROM public.company_settings WHERE organization_id = demo_organization_id)
         END,
         setting_name
       )
     )
     OR EXISTS (
       SELECT 1 FROM (VALUES ('Day Shift'), ('Afternoon Shift'), ('Night Shift')) AS expected(shift_name)
       WHERE NOT public.company_setting_has_active_name(
         (SELECT working_hours->'shifts' FROM public.company_settings WHERE organization_id = demo_organization_id),
         shift_name
       )
     )
     OR (SELECT count(*) FROM public.sites
         WHERE organization_id = demo_organization_id
           AND public.company_setting_has_active_name(
             (SELECT operational_sites FROM public.company_settings WHERE organization_id = demo_organization_id), name
           )) <> 8
     OR (SELECT count(*) FROM public.facilities WHERE organization_id = demo_organization_id) <> 8 THEN
    RAISE EXCEPTION 'Demo company settings do not contain all active departments, sites, shifts, categories, severities, or facilities.';
  END IF;

  IF (SELECT min(occurred_at) FROM public.incidents
      WHERE organization_id = demo_organization_id
        AND digital_signature = 'DEMO-SEED:sentinelqhse-v1' AND status <> 'draft')
       IS DISTINCT FROM timestamptz '2023-09-29 00:00:00+00'
     OR (SELECT max(occurred_at) FROM public.incidents
         WHERE organization_id = demo_organization_id
           AND digital_signature = 'DEMO-SEED:sentinelqhse-v1' AND status <> 'draft')
       IS DISTINCT FROM timestamptz '2026-09-29 23:59:59+00'
     OR EXISTS (
       SELECT 1 FROM public.incidents
       WHERE organization_id = demo_organization_id
         AND digital_signature = 'DEMO-SEED:sentinelqhse-v1'
         AND status <> 'draft'
         AND (reported_at < occurred_at OR reported_at > timestamptz '2026-09-29 23:59:59+00')
     ) THEN
    RAISE EXCEPTION 'Demo incident dates are outside 2023-09-29 through 2026-09-29 or are chronologically invalid.';
  END IF;

  SELECT count(*) INTO orphan_count FROM (
    SELECT 1 FROM public.profiles profile
    LEFT JOIN auth.users auth_user ON auth_user.id = profile.id
    WHERE profile.organization_id = demo_organization_id AND profile.employee_id LIKE 'DEMO-%'
      AND (auth_user.id IS NULL OR NOT EXISTS (SELECT 1 FROM public.organizations org WHERE org.id = profile.organization_id))
    UNION ALL
    SELECT 1 FROM public.memberships membership
    WHERE membership.organization_id = demo_organization_id
      AND (NOT EXISTS (SELECT 1 FROM auth.users auth_user WHERE auth_user.id = membership.user_id)
        OR NOT EXISTS (SELECT 1 FROM public.profiles profile WHERE profile.id = membership.user_id AND profile.organization_id = membership.organization_id))
    UNION ALL
    SELECT 1 FROM public.notification_preferences preference
    LEFT JOIN public.profiles profile ON profile.id = preference.user_id
    LEFT JOIN auth.users auth_user ON auth_user.id = preference.user_id
    WHERE ((profile.organization_id = demo_organization_id AND profile.employee_id LIKE 'DEMO-%')
        OR auth_user.raw_user_meta_data->>'sentinel_demo' = 'true')
      AND (auth_user.id IS NULL OR profile.id IS NULL
        OR profile.organization_id IS DISTINCT FROM demo_organization_id)
    UNION ALL
    SELECT 1 FROM public.company_settings settings
    WHERE settings.organization_id = demo_organization_id
      AND NOT EXISTS (SELECT 1 FROM public.organizations org WHERE org.id = settings.organization_id)
    UNION ALL
    SELECT 1 FROM public.sites site
    WHERE site.organization_id = demo_organization_id
      AND NOT EXISTS (SELECT 1 FROM public.organizations org WHERE org.id = site.organization_id)
    UNION ALL
    SELECT 1 FROM public.facilities facility
    WHERE facility.organization_id = demo_organization_id
      AND (NOT EXISTS (SELECT 1 FROM public.organizations org WHERE org.id = facility.organization_id)
        OR NOT EXISTS (SELECT 1 FROM public.sites site WHERE site.id = facility.site_id AND site.organization_id = facility.organization_id))
    UNION ALL
    SELECT 1 FROM public.incidents incident
    WHERE incident.organization_id = demo_organization_id
      AND incident.digital_signature = 'DEMO-SEED:sentinelqhse-v1'
      AND (NOT EXISTS (SELECT 1 FROM public.organizations org WHERE org.id = incident.organization_id)
        OR NOT EXISTS (SELECT 1 FROM auth.users auth_user WHERE auth_user.id = incident.reported_by)
        OR NOT EXISTS (SELECT 1 FROM auth.users auth_user WHERE auth_user.id = incident.created_by)
        OR NOT EXISTS (SELECT 1 FROM public.profiles profile WHERE profile.id = incident.reported_by AND profile.organization_id = incident.organization_id)
        OR NOT EXISTS (SELECT 1 FROM public.profiles profile WHERE profile.id = incident.created_by AND profile.organization_id = incident.organization_id)
        OR (incident.site_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sites site WHERE site.id = incident.site_id AND site.organization_id = incident.organization_id))
        OR (incident.facility_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.facilities facility WHERE facility.id = incident.facility_id AND facility.organization_id = incident.organization_id)))
    UNION ALL
    SELECT 1 FROM public.investigations investigation
    LEFT JOIN public.incidents incident ON incident.id = investigation.incident_id AND incident.organization_id = investigation.organization_id
    WHERE investigation.organization_id = demo_organization_id
      AND (incident.id IS NULL OR incident.digital_signature = 'DEMO-SEED:sentinelqhse-v1')
      AND (incident.id IS NULL
        OR NOT EXISTS (SELECT 1 FROM public.organizations org WHERE org.id = investigation.organization_id)
        OR NOT EXISTS (SELECT 1 FROM public.profiles profile WHERE profile.id = investigation.assigned_investigator_id AND profile.organization_id = investigation.organization_id)
        OR NOT EXISTS (SELECT 1 FROM public.profiles profile WHERE profile.id = investigation.investigation_lead_id AND profile.organization_id = investigation.organization_id)
        OR NOT EXISTS (SELECT 1 FROM public.profiles profile WHERE profile.id = investigation.assigned_by AND profile.organization_id = investigation.organization_id)
        OR NOT EXISTS (SELECT 1 FROM public.profiles profile WHERE profile.id = investigation.created_by AND profile.organization_id = investigation.organization_id))
    UNION ALL
    SELECT 1 FROM public.corrective_actions action
    WHERE action.organization_id = demo_organization_id
      AND action.description LIKE 'SentinelQHSE demo seed v1:%'
      AND (NOT EXISTS (SELECT 1 FROM public.organizations org WHERE org.id = action.organization_id)
        OR NOT EXISTS (SELECT 1 FROM public.incidents incident WHERE incident.id = action.incident_id AND incident.organization_id = action.organization_id)
        OR (action.investigation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.investigations investigation WHERE investigation.id = action.investigation_id AND investigation.organization_id = action.organization_id))
        OR NOT EXISTS (SELECT 1 FROM public.profiles profile WHERE profile.id = action.assigned_owner_id AND profile.organization_id = action.organization_id)
        OR NOT EXISTS (SELECT 1 FROM public.profiles profile WHERE profile.id = action.assigned_by AND profile.organization_id = action.organization_id)
        OR NOT EXISTS (SELECT 1 FROM public.profiles profile WHERE profile.id = action.created_by AND profile.organization_id = action.organization_id)
        OR (action.verified_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles profile WHERE profile.id = action.verified_by AND profile.organization_id = action.organization_id)))
    UNION ALL
    SELECT 1 FROM public.incident_people person
    LEFT JOIN public.incidents incident ON incident.id = person.incident_id AND incident.organization_id = person.organization_id
    WHERE person.organization_id = demo_organization_id
      AND (incident.id IS NULL OR incident.digital_signature = 'DEMO-SEED:sentinelqhse-v1')
      AND (incident.id IS NULL
        OR NOT EXISTS (SELECT 1 FROM public.organizations org WHERE org.id = person.organization_id)
        OR (person.profile_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles profile WHERE profile.id = person.profile_id AND profile.organization_id = person.organization_id)))
    UNION ALL
    SELECT 1 FROM public.activity_logs activity
    WHERE activity.organization_id = demo_organization_id
      AND activity.metadata->>'demo_seed' = 'sentinelqhse-v1'
      AND (NOT EXISTS (SELECT 1 FROM public.organizations org WHERE org.id = activity.organization_id)
        OR (activity.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users auth_user WHERE auth_user.id = activity.user_id)))
  ) orphaned;
  IF orphan_count <> 0 THEN
    RAISE EXCEPTION 'Found % demo orphan or cross-organization foreign-key relationships.', orphan_count;
  END IF;

  SELECT count(*) INTO rls_problem_count
  FROM (VALUES
    ('organizations'), ('profiles'), ('memberships'), ('notification_preferences'),
    ('company_settings'), ('sites'), ('facilities'), ('incidents'), ('incident_people'),
    ('investigations'), ('corrective_actions'), ('corrective_action_sequences'),
    ('incident_sequences'), ('activity_logs')
  ) AS expected(table_name)
  LEFT JOIN pg_class relation ON relation.oid = to_regclass('public.' || expected.table_name)
  WHERE relation.oid IS NULL OR NOT relation.relrowsecurity;
  IF rls_problem_count <> 0 THEN
    RAISE EXCEPTION 'RLS is missing or disabled on % tables used by the demo seed.', rls_problem_count;
  END IF;
END;
$validate_demo_seed$;

SELECT 'Foreign-key integrity and orphan checks' AS check_name, 'PASS' AS result;

SELECT relation.relname AS table_name, relation.relrowsecurity AS rls_enabled
FROM pg_class relation
JOIN pg_namespace schema_info ON schema_info.oid = relation.relnamespace
WHERE schema_info.nspname = 'public'
  AND relation.relname IN (
    'organizations', 'profiles', 'memberships', 'notification_preferences', 'company_settings',
    'sites', 'facilities', 'incidents', 'incident_people', 'investigations',
    'corrective_actions', 'corrective_action_sequences', 'incident_sequences', 'activity_logs'
  )
ORDER BY relation.relname;

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
