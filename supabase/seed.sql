BEGIN;

CREATE TEMP TABLE _sentinel_demo_user_input (
  user_order integer PRIMARY KEY,
  full_name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL,
  department text NOT NULL,
  job_title text NOT NULL,
  site_name text NOT NULL,
  employment_type text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sentinel_demo_user_input VALUES
  (1, 'Chinedu Okafor', 'chinedu.okafor.demo@sentinelqhse.example', 'Super Administrator', 'Administration', 'Demo Organization Administrator', 'Lagos Head Office', 'employee'),
  (2, 'Adebayo Adeyemi', 'adebayo.adeyemi.demo@sentinelqhse.example', 'QHSE Manager', 'HSE', 'QHSE Manager', 'Lagos Head Office', 'employee'),
  (3, 'Chiamaka Nwosu', 'chiamaka.nwosu.demo@sentinelqhse.example', 'Safety Officer / HSE Officer', 'HSE', 'Environmental Officer', 'Port Harcourt Operations Base', 'employee'),
  (4, 'Ibrahim Musa', 'ibrahim.musa.demo@sentinelqhse.example', 'Site Supervisor', 'Operations', 'Operations Supervisor', 'Port Harcourt Operations Base', 'employee'),
  (5, 'Ngozi Eze', 'ngozi.eze.demo@sentinelqhse.example', 'Auditor', 'HSE', 'Internal Auditor', 'Lagos Head Office', 'employee'),
  (6, 'Emeka Obi', 'emeka.obi.demo@sentinelqhse.example', 'Maintenance Engineer', 'Maintenance', 'Maintenance Engineer', 'Warri Field Operations', 'employee'),
  (7, 'Fatima Bello', 'fatima.bello.demo@sentinelqhse.example', 'Field Worker', 'Operations', 'Field Technician', 'Bonny Operations Site', 'employee'),
  (8, 'Tunde Adebayo', 'tunde.adebayo.demo@sentinelqhse.example', 'Safety Officer / HSE Officer', 'HSE', 'Safety Officer', 'Onne Logistics Base', 'employee'),
  (9, 'Blessing Ebi', 'blessing.ebi.demo@sentinelqhse.example', 'Contractor', 'Engineering', 'Electrical Contractor', 'Escravos Operations Site', 'contractor'),
  (10, 'Daniel Okoro', 'daniel.okoro.demo@sentinelqhse.example', 'Field Worker', 'Engineering', 'Mechanical Technician', 'Warri Field Operations', 'employee'),
  (11, 'Esther Williams', 'esther.williams.demo@sentinelqhse.example', 'Executive / Management', 'Administration', 'Operations Director', 'Lagos Head Office', 'employee'),
  (12, 'Samuel Nwachukwu', 'samuel.nwachukwu.demo@sentinelqhse.example', 'Field Worker', 'Maintenance', 'Maintenance Technician', 'Port Harcourt Operations Base', 'employee'),
  (13, 'Halima Abdullahi', 'halima.abdullahi.demo@sentinelqhse.example', 'Field Worker', 'Logistics', 'Logistics Coordinator', 'Onne Logistics Base', 'employee'),
  (14, 'Kelechi Umeh', 'kelechi.umeh.demo@sentinelqhse.example', 'Site Supervisor', 'Engineering', 'Engineering Supervisor', 'Escravos Operations Site', 'employee'),
  (15, 'David Alabi', 'david.alabi.demo@sentinelqhse.example', 'Field Worker', 'Security', 'Security Officer', 'Calabar Support Base', 'employee'),
  (16, 'Amarachi Okeke', 'amarachi.okeke.demo@sentinelqhse.example', 'Field Worker', 'Procurement', 'Procurement Officer', 'Lagos Head Office', 'employee'),
  (17, 'Yusuf Ibrahim', 'yusuf.ibrahim.demo@sentinelqhse.example', 'Maintenance Engineer', 'Maintenance', 'Instrument Technician', 'Yenagoa Field Office', 'employee'),
  (18, 'Mercy Johnson', 'mercy.johnson.demo@sentinelqhse.example', 'Organization Administrator', 'Human Resources', 'HR Administrator', 'Lagos Head Office', 'employee'),
  (19, 'Kingsley Eze', 'kingsley.eze.demo@sentinelqhse.example', 'Field Worker', 'Finance', 'Finance Officer', 'Calabar Support Base', 'employee'),
  (20, 'Favour Odu', 'favour.odu.demo@sentinelqhse.example', 'Field Worker', 'Operations', 'Process Operator', 'Bonny Operations Site', 'employee');

DO $preflight$
DECLARE
  missing_tables text[];
  missing_columns text[];
  demo_auth_count integer;
  organization_id_conflict boolean;
BEGIN
  SELECT array_agg(required.table_name)
  INTO missing_tables
  FROM (VALUES
    ('organizations'), ('profiles'), ('memberships'), ('notification_preferences'),
    ('company_settings'), ('sites'), ('facilities'), ('incidents'), ('investigations'),
    ('incident_people'), ('corrective_actions'), ('activity_logs')
  ) AS required(table_name)
  WHERE to_regclass(format('public.%I', required.table_name)) IS NULL;

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'SentinelQHSE demo seed stopped: required tables are missing: %', missing_tables;
  END IF;

  SELECT array_agg(required.table_name || '.' || required.column_name)
  INTO missing_columns
  FROM (VALUES
    ('organizations', 'id'), ('organizations', 'company_code'), ('organizations', 'company_name'),
    ('organizations', 'industry'), ('organizations', 'company_size'), ('organizations', 'country'),
    ('organizations', 'state'), ('organizations', 'address'), ('organizations', 'contact_email'),
    ('organizations', 'contact_phone'),
    ('profiles', 'id'), ('profiles', 'organization_id'), ('profiles', 'employee_id'),
    ('profiles', 'full_name'), ('profiles', 'department'), ('profiles', 'job_title'),
    ('profiles', 'phone'), ('profiles', 'site_location'), ('profiles', 'supervisor'),
    ('profiles', 'certification_status'), ('profiles', 'employment_type'), ('profiles', 'account_status'),
    ('memberships', 'user_id'), ('memberships', 'organization_id'), ('memberships', 'role'),
    ('notification_preferences', 'user_id'), ('notification_preferences', 'email'),
    ('notification_preferences', 'sms'), ('notification_preferences', 'push'),
    ('notification_preferences', 'incident_assignments'), ('notification_preferences', 'corrective_action_reminders'),
    ('notification_preferences', 'audit_reminders'),
    ('company_settings', 'organization_id'), ('company_settings', 'working_hours'),
    ('company_settings', 'departments'), ('company_settings', 'operational_sites'),
    ('company_settings', 'emergency_contacts'), ('company_settings', 'incident_categories'),
    ('company_settings', 'risk_categories'), ('company_settings', 'severity_levels'),
    ('company_settings', 'inspection_templates'),
    ('sites', 'id'), ('sites', 'organization_id'), ('sites', 'name'), ('sites', 'code'),
    ('sites', 'address'), ('sites', 'latitude'), ('sites', 'longitude'),
    ('facilities', 'id'), ('facilities', 'organization_id'), ('facilities', 'site_id'),
    ('facilities', 'name'), ('facilities', 'code'),
    ('incidents', 'id'), ('incidents', 'organization_id'), ('incidents', 'reference_number'),
    ('incidents', 'report_type'), ('incidents', 'status'), ('incidents', 'title'),
    ('incidents', 'description'), ('incidents', 'occurred_at'), ('incidents', 'reported_at'),
    ('incidents', 'site_id'), ('incidents', 'facility_id'), ('incidents', 'location'),
    ('incidents', 'department'), ('incidents', 'shift'), ('incidents', 'work_activity_context'),
    ('incidents', 'reported_by'), ('incidents', 'created_by'), ('incidents', 'contractor_involved'),
    ('incidents', 'contractor_organization'), ('incidents', 'severity'), ('incidents', 'potential_severity'),
    ('incidents', 'incident_category'), ('incidents', 'environmental_impact'),
    ('incidents', 'injury_or_illness'), ('incidents', 'property_damage'), ('incidents', 'work_related'),
    ('incidents', 'immediate_correction'), ('incidents', 'priority'), ('incidents', 'gps_coordinates'),
    ('incidents', 'weather_conditions'), ('incidents', 'equipment_involved'),
    ('incidents', 'people_involved'), ('incidents', 'witnesses'), ('incidents', 'potential_root_cause'),
    ('incidents', 'digital_signature'), ('incidents', 'accuracy_confirmed'),
    ('incidents', 'draft_stage'), ('incidents', 'created_at'), ('incidents', 'updated_at'),
    ('investigations', 'id'), ('investigations', 'organization_id'), ('investigations', 'incident_id'),
    ('investigations', 'status'), ('investigations', 'assigned_investigator_id'),
    ('investigations', 'investigation_lead_id'), ('investigations', 'assigned_by'),
    ('investigations', 'assigned_at'), ('investigations', 'started_at'),
    ('investigations', 'target_completion_date'), ('investigations', 'completed_at'),
    ('investigations', 'investigation_summary'), ('investigations', 'findings_summary'),
    ('investigations', 'conclusions'), ('investigations', 'created_by'), ('investigations', 'created_at'),
    ('incident_people', 'id'), ('incident_people', 'organization_id'), ('incident_people', 'incident_id'),
    ('incident_people', 'person_type'), ('incident_people', 'profile_id'), ('incident_people', 'full_name'),
    ('incident_people', 'organization_name'), ('incident_people', 'contact_details'), ('incident_people', 'created_at'),
    ('corrective_actions', 'id'), ('corrective_actions', 'organization_id'),
    ('corrective_actions', 'reference_number'), ('corrective_actions', 'incident_id'),
    ('corrective_actions', 'investigation_id'), ('corrective_actions', 'title'),
    ('corrective_actions', 'description'), ('corrective_actions', 'action_category'),
    ('corrective_actions', 'priority'), ('corrective_actions', 'status'),
    ('corrective_actions', 'assigned_owner_id'), ('corrective_actions', 'assigned_by'),
    ('corrective_actions', 'assigned_at'), ('corrective_actions', 'due_date'),
    ('corrective_actions', 'completion_date'), ('corrective_actions', 'verification_status'),
    ('corrective_actions', 'verification_date'), ('corrective_actions', 'verified_by'),
    ('corrective_actions', 'verification_notes'), ('corrective_actions', 'created_by'),
    ('corrective_actions', 'created_at'), ('corrective_actions', 'updated_at'),
    ('activity_logs', 'id'), ('activity_logs', 'organization_id'), ('activity_logs', 'user_id'),
    ('activity_logs', 'activity'), ('activity_logs', 'metadata'), ('activity_logs', 'location'),
    ('activity_logs', 'created_at')
  ) AS required(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns column_info
    WHERE column_info.table_schema = 'public'
      AND column_info.table_name = required.table_name
      AND column_info.column_name = required.column_name
  );

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'SentinelQHSE demo seed stopped: required columns are missing: %', missing_columns;
  END IF;

  SELECT count(*) INTO demo_auth_count
  FROM _sentinel_demo_user_input input
  WHERE (
    SELECT count(*)
    FROM auth.users auth_user
    WHERE auth_user.raw_user_meta_data->>'sentinel_demo' = 'true'
      AND auth_user.raw_app_meta_data->>'sentinel_demo' = 'true'
      AND auth_user.email_confirmed_at IS NOT NULL
      AND auth_user.raw_user_meta_data->>'full_name' = input.full_name
  ) = 1;
  IF demo_auth_count <> 20 THEN
    RAISE EXCEPTION 'SentinelQHSE demo seed requires all 20 Auth users created by scripts/create-demo-users.mjs; found % marked demo accounts.', demo_auth_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('incident_status', 'draft'), ('incident_status', 'submitted'),
      ('incident_status', 'under_review'), ('incident_status', 'investigation'),
      ('incident_status', 'corrective_action'), ('incident_status', 'pending_verification'),
      ('incident_status', 'closed'),
      ('incident_report_type', 'incident'), ('incident_report_type', 'near_miss'),
      ('incident_report_type', 'unsafe_act'), ('incident_report_type', 'unsafe_condition'),
      ('incident_report_type', 'environmental_incident'),
      ('investigation_status', 'assigned'), ('investigation_status', 'in_progress'),
      ('investigation_status', 'pending_review'), ('investigation_status', 'completed'),
      ('corrective_action_status', 'open'), ('corrective_action_status', 'in_progress'),
      ('corrective_action_status', 'pending_verification'), ('corrective_action_status', 'verified'),
      ('corrective_action_status', 'closed')
    ) AS required(type_name, label)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_enum enum_value
      JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
      WHERE enum_type.typnamespace = 'public'::regnamespace
        AND enum_type.typname = required.type_name
        AND enum_value.enumlabel = required.label
    )
  ) THEN
    RAISE EXCEPTION 'SentinelQHSE demo seed stopped: one or more expected enum values are missing.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = 'c623e7b1-c717-52a3-8a7c-51e50d3b4f18'::uuid
      AND (company_name <> 'Sentinel Energy & Industrial Services Ltd' OR company_code <> 'SENTINEL-DEMO')
  ) INTO organization_id_conflict;
  IF organization_id_conflict THEN
    RAISE EXCEPTION 'The stable Sentinel demo organization ID is already used by another organization.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organizations
    WHERE company_code = 'SENTINEL-DEMO'
      AND company_name <> 'Sentinel Energy & Industrial Services Ltd'
  ) THEN
    RAISE EXCEPTION 'SENTINEL-DEMO belongs to a different organization; refusing to modify it.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organizations
    WHERE company_name = 'Sentinel Energy & Industrial Services Ltd'
      AND (address IS NULL OR address NOT LIKE 'DEMO DATA ONLY%')
  ) AND NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE company_code = 'SENTINEL-DEMO'
      AND company_name = 'Sentinel Energy & Industrial Services Ltd'
  ) THEN
    RAISE EXCEPTION 'An organization with the demo name exists without the DEMO DATA ONLY marker; refusing to adopt it.';
  END IF;

  IF (
    SELECT count(*) FROM public.organizations
    WHERE company_code = 'SENTINEL-DEMO'
       OR (company_name = 'Sentinel Energy & Industrial Services Ltd' AND address LIKE 'DEMO DATA ONLY%')
  ) > 1 THEN
    RAISE EXCEPTION 'Multiple possible demo organizations exist; refusing to choose one automatically.';
  END IF;

  IF EXISTS (
    SELECT 1
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
      AND incident.digital_signature IS DISTINCT FROM 'DEMO-SEED:sentinelqhse-v1'
  ) THEN
    RAISE EXCEPTION 'Legacy DEMO-INC records already exist for this organization; refusing to create a second incident batch.';
  END IF;
END;
$preflight$;

INSERT INTO public.organizations (
  id, company_code, company_name, industry, company_size, region, country, state,
  address, contact_email, contact_phone
)
SELECT
  'c623e7b1-c717-52a3-8a7c-51e50d3b4f18'::uuid,
  'SENTINEL-DEMO',
  'Sentinel Energy & Industrial Services Ltd',
  'Energy and Industrial Services',
  'Medium',
  'South South',
  'Nigeria',
  'Rivers',
  'DEMO DATA ONLY - synthetic locations; no real operating facilities are represented',
  'demo-admin@sentinelqhse.example',
  '+2348000000000'
WHERE NOT EXISTS (
  SELECT 1 FROM public.organizations
  WHERE company_code = 'SENTINEL-DEMO'
     OR (company_name = 'Sentinel Energy & Industrial Services Ltd' AND address LIKE 'DEMO DATA ONLY%')
)
ON CONFLICT (company_code) DO NOTHING;

CREATE TEMP TABLE _sentinel_demo_org ON COMMIT DROP AS
SELECT id
FROM public.organizations
WHERE company_code = 'SENTINEL-DEMO'
   OR (company_name = 'Sentinel Energy & Industrial Services Ltd' AND address LIKE 'DEMO DATA ONLY%');

DO $organization_check$
BEGIN
  IF (SELECT count(*) FROM _sentinel_demo_org) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one clearly marked Sentinel demo organization.';
  END IF;
END;
$organization_check$;

CREATE TEMP TABLE _sentinel_demo_users ON COMMIT DROP AS
SELECT
  input.*,
  auth_user.id AS user_id,
  ('DEMO-' || lpad(input.user_order::text, 3, '0')) AS employee_id
FROM _sentinel_demo_user_input input
JOIN LATERAL (
  SELECT candidate.id
  FROM auth.users candidate
  WHERE candidate.raw_user_meta_data->>'sentinel_demo' = 'true'
    AND candidate.raw_app_meta_data->>'sentinel_demo' = 'true'
    AND candidate.email_confirmed_at IS NOT NULL
    AND candidate.raw_user_meta_data->>'full_name' = input.full_name
  ORDER BY (lower(candidate.email) = input.email) DESC
  LIMIT 1
) auth_user ON true;

CREATE TEMP TABLE _sentinel_demo_sites (
  site_order integer PRIMARY KEY,
  name text NOT NULL,
  code text NOT NULL,
  address text NOT NULL,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  facility_name text NOT NULL,
  facility_code text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sentinel_demo_sites VALUES
  (1, 'Lagos Head Office', 'DEMO-LAGOS-HO', 'Demo location, Lagos, Nigeria', 6.5244, 3.3792, 'Lagos Head Office - Main Operations Area', 'DEMO-LAGOS-HO-FAC-01'),
  (2, 'Port Harcourt Operations Base', 'DEMO-PH-BASE', 'Demo location, Port Harcourt, Nigeria', 4.8156, 7.0498, 'Port Harcourt Operations - Main Operations Area', 'DEMO-PH-BASE-FAC-01'),
  (3, 'Onne Logistics Base', 'DEMO-ONNE-LOG', 'Demo location, Onne, Nigeria', 4.7000, 7.1500, 'Onne Logistics - Main Operations Area', 'DEMO-ONNE-LOG-FAC-01'),
  (4, 'Warri Field Operations', 'DEMO-WARRI-FLD', 'Demo location, Warri, Nigeria', 5.5160, 5.7500, 'Warri Field Operations - Main Operations Area', 'DEMO-WARRI-FLD-FAC-01'),
  (5, 'Bonny Operations Site', 'DEMO-BONNY-OPS', 'Demo location, Bonny, Nigeria', 4.4500, 7.1700, 'Bonny Operations - Main Operations Area', 'DEMO-BONNY-OPS-FAC-01'),
  (6, 'Yenagoa Field Office', 'DEMO-YENAGOA', 'Demo location, Yenagoa, Nigeria', 4.9200, 6.2600, 'Yenagoa Field Office - Main Operations Area', 'DEMO-YENAGOA-FAC-01'),
  (7, 'Escravos Operations Site', 'DEMO-ESCRAVOS', 'Demo location, Escravos, Nigeria', 5.5400, 5.1900, 'Escravos Operations - Main Operations Area', 'DEMO-ESCRAVOS-FAC-01'),
  (8, 'Calabar Support Base', 'DEMO-CALABAR', 'Demo location, Calabar, Nigeria', 4.9500, 8.3200, 'Calabar Support Base - Main Operations Area', 'DEMO-CALABAR-FAC-01');

CREATE TEMP TABLE _sentinel_demo_departments (name text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _sentinel_demo_departments VALUES
  ('HSE'), ('Operations'), ('Maintenance'), ('Engineering'), ('Procurement'),
  ('Human Resources'), ('Finance'), ('Security'), ('Logistics'), ('Administration');

CREATE TEMP TABLE _sentinel_demo_config (
  setting_key text NOT NULL,
  setting_order integer NOT NULL,
  value jsonb NOT NULL,
  PRIMARY KEY (setting_key, setting_order)
) ON COMMIT DROP;

INSERT INTO _sentinel_demo_config VALUES
  ('departments', 1, '{"name":"HSE","active":true}'),
  ('departments', 2, '{"name":"Operations","active":true}'),
  ('departments', 3, '{"name":"Maintenance","active":true}'),
  ('departments', 4, '{"name":"Engineering","active":true}'),
  ('departments', 5, '{"name":"Procurement","active":true}'),
  ('departments', 6, '{"name":"Human Resources","active":true}'),
  ('departments', 7, '{"name":"Finance","active":true}'),
  ('departments', 8, '{"name":"Security","active":true}'),
  ('departments', 9, '{"name":"Logistics","active":true}'),
  ('departments', 10, '{"name":"Administration","active":true}'),
  ('operational_sites', 1, '{"name":"Lagos Head Office","active":true}'),
  ('operational_sites', 2, '{"name":"Port Harcourt Operations Base","active":true}'),
  ('operational_sites', 3, '{"name":"Onne Logistics Base","active":true}'),
  ('operational_sites', 4, '{"name":"Warri Field Operations","active":true}'),
  ('operational_sites', 5, '{"name":"Bonny Operations Site","active":true}'),
  ('operational_sites', 6, '{"name":"Yenagoa Field Office","active":true}'),
  ('operational_sites', 7, '{"name":"Escravos Operations Site","active":true}'),
  ('operational_sites', 8, '{"name":"Calabar Support Base","active":true}'),
  ('incident_categories', 1, '{"name":"Incident","active":true}'),
  ('incident_categories', 2, '{"name":"Near Miss","active":true}'),
  ('incident_categories', 3, '{"name":"Unsafe Act","active":true}'),
  ('incident_categories', 4, '{"name":"Unsafe Condition","active":true}'),
  ('incident_categories', 5, '{"name":"Environmental Incident","active":true}'),
  ('incident_categories', 6, '{"name":"Injury / Illness","active":true}'),
  ('incident_categories', 7, '{"name":"Vehicle / Transportation Incident","active":true}'),
  ('incident_categories', 8, '{"name":"Fire / Explosion","active":true}'),
  ('incident_categories', 9, '{"name":"Property / Equipment Damage","active":true}'),
  ('incident_categories', 10, '{"name":"Process Safety Incident","active":true}'),
  ('incident_categories', 11, '{"name":"Security Incident","active":true}'),
  ('incident_categories', 12, '{"name":"Occupational Health","active":true}'),
  ('incident_categories', 13, '{"name":"Chemical / Hazardous Substance","active":true}'),
  ('incident_categories', 14, '{"name":"Electrical Incident","active":true}'),
  ('incident_categories', 15, '{"name":"Lifting / Dropped Object","active":true}'),
  ('incident_categories', 16, '{"name":"Confined Space","active":true}'),
  ('incident_categories', 17, '{"name":"Working at Height","active":true}'),
  ('severity_levels', 1, '{"name":"low","active":true}'),
  ('severity_levels', 2, '{"name":"medium","active":true}'),
  ('severity_levels', 3, '{"name":"high","active":true}'),
  ('severity_levels', 4, '{"name":"critical","active":true}'),
  ('risk_categories', 1, '{"name":"People","active":true}'),
  ('risk_categories', 2, '{"name":"Environment","active":true}'),
  ('risk_categories', 3, '{"name":"Asset","active":true}'),
  ('risk_categories', 4, '{"name":"Process Safety","active":true}'),
  ('emergency_contacts', 1, '{"id":"demo-control-room","name":"Demo Control Room","role":"Operations response","phone":"+2348012349901","email":"control-room.demo@sentinelqhse.example","active":true}'),
  ('emergency_contacts', 2, '{"id":"demo-hse-desk","name":"Demo HSE Duty Desk","role":"HSE response","phone":"+2348012349902","email":"hse-duty.demo@sentinelqhse.example","active":true}'),
  ('shifts', 1, '{"id":"demo-day","name":"Day Shift","start":"07:00","end":"15:00","active":true}'),
  ('shifts', 2, '{"id":"demo-afternoon","name":"Afternoon Shift","start":"15:00","end":"23:00","active":true}'),
  ('shifts', 3, '{"id":"demo-night","name":"Night Shift","start":"23:00","end":"07:00","active":true}');

INSERT INTO public.company_settings (
  organization_id, working_hours, departments, operational_sites, emergency_contacts,
  incident_categories, risk_categories, severity_levels, inspection_templates
)
SELECT id, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
       '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
FROM _sentinel_demo_org
ON CONFLICT (organization_id) DO NOTHING;

DO $merge_settings$
DECLARE
  setting_name text;
  current_values jsonb;
  merged_values jsonb;
  v_organization_id uuid;
BEGIN
  SELECT id INTO v_organization_id FROM _sentinel_demo_org;
  FOR setting_name IN SELECT DISTINCT setting_key FROM _sentinel_demo_config LOOP
    IF setting_name = 'shifts' THEN
      SELECT working_hours->'shifts' INTO current_values
      FROM public.company_settings WHERE company_settings.organization_id = v_organization_id;
    ELSE
      EXECUTE format(
        'SELECT %I FROM public.company_settings WHERE organization_id = $1',
        setting_name
      ) INTO current_values USING v_organization_id;
    END IF;

    SELECT
      COALESCE((
        SELECT jsonb_agg(
          CASE
            WHEN EXISTS (
              SELECT 1 FROM _sentinel_demo_config desired
              WHERE desired.setting_key = setting_name
                AND (
                  CASE WHEN setting_name = 'shifts'
                    THEN lower(regexp_replace(btrim(desired.value->>'name'), ' shift$', '', 'i'))
                    ELSE lower(btrim(desired.value->>'name'))
                  END
                ) = (
                  CASE WHEN setting_name = 'shifts'
                    THEN lower(regexp_replace(btrim(COALESCE(existing.value->>'name', existing.value #>> '{}')), ' shift$', '', 'i'))
                    ELSE lower(btrim(COALESCE(existing.value->>'name', existing.value #>> '{}')))
                  END
                )
            ) THEN
              CASE WHEN jsonb_typeof(existing.value) = 'object' THEN
                existing.value || jsonb_build_object(
                  'name',
                  (
                    SELECT desired.value->>'name'
                    FROM _sentinel_demo_config desired
                    WHERE desired.setting_key = setting_name
                      AND (
                        CASE WHEN setting_name = 'shifts'
                          THEN lower(regexp_replace(btrim(desired.value->>'name'), ' shift$', '', 'i'))
                          ELSE lower(btrim(desired.value->>'name'))
                        END
                      ) = (
                        CASE WHEN setting_name = 'shifts'
                          THEN lower(regexp_replace(btrim(COALESCE(existing.value->>'name', existing.value #>> '{}')), ' shift$', '', 'i'))
                          ELSE lower(btrim(COALESCE(existing.value->>'name', existing.value #>> '{}')))
                        END
                      )
                    ORDER BY desired.setting_order
                    LIMIT 1
                  ),
                  'active',
                  true
                )
              ELSE (
                SELECT desired.value
                FROM _sentinel_demo_config desired
                WHERE desired.setting_key = setting_name
                  AND (
                    CASE WHEN setting_name = 'shifts'
                      THEN lower(regexp_replace(btrim(desired.value->>'name'), ' shift$', '', 'i'))
                      ELSE lower(btrim(desired.value->>'name'))
                    END
                  ) = (
                    CASE WHEN setting_name = 'shifts'
                      THEN lower(regexp_replace(btrim(COALESCE(existing.value->>'name', existing.value #>> '{}')), ' shift$', '', 'i'))
                      ELSE lower(btrim(COALESCE(existing.value->>'name', existing.value #>> '{}')))
                    END
                  )
                ORDER BY desired.setting_order
                LIMIT 1
              )
              END
            ELSE existing.value
          END
          ORDER BY existing.ordinality
        )
        FROM jsonb_array_elements(COALESCE(current_values, '[]'::jsonb))
          WITH ORDINALITY AS existing(value, ordinality)
      ), '[]'::jsonb)
      ||
      COALESCE((
        SELECT jsonb_agg(desired.value ORDER BY desired.setting_order)
        FROM _sentinel_demo_config desired
        WHERE desired.setting_key = setting_name
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(current_values, '[]'::jsonb)) existing(value)
            WHERE (
              CASE WHEN setting_name = 'shifts'
                THEN lower(regexp_replace(btrim(COALESCE(existing.value->>'name', existing.value #>> '{}')), ' shift$', '', 'i'))
                ELSE lower(btrim(COALESCE(existing.value->>'name', existing.value #>> '{}')))
              END
            ) = (
              CASE WHEN setting_name = 'shifts'
                THEN lower(regexp_replace(btrim(desired.value->>'name'), ' shift$', '', 'i'))
                ELSE lower(btrim(desired.value->>'name'))
              END
            )
          )
      ), '[]'::jsonb)
    INTO merged_values;

    IF setting_name = 'shifts' THEN
      UPDATE public.company_settings
      SET working_hours = jsonb_set(
        COALESCE(working_hours, '{}'::jsonb),
        '{shifts}',
        merged_values,
        true
      )
      WHERE public.company_settings.organization_id = v_organization_id;
    ELSE
      EXECUTE format(
        'UPDATE public.company_settings SET %I = $1 WHERE organization_id = $2',
        setting_name
      ) USING merged_values, v_organization_id;
    END IF;
  END LOOP;
END;
$merge_settings$;

DO $site_preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM _sentinel_demo_sites expected
    JOIN _sentinel_demo_org demo ON true
    JOIN public.sites existing ON existing.organization_id = demo.id
      AND (existing.code = expected.code OR existing.name = expected.name)
    WHERE existing.code <> expected.code OR existing.name <> expected.name
  ) THEN
    RAISE EXCEPTION 'A demo site name/code is already assigned to a different site; refusing to modify it.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _sentinel_demo_sites expected
    JOIN _sentinel_demo_org demo ON true
    JOIN public.facilities existing ON existing.organization_id = demo.id
      AND (existing.code = expected.facility_code OR existing.name = expected.facility_name)
    WHERE existing.code <> expected.facility_code OR existing.name <> expected.facility_name
  ) THEN
    RAISE EXCEPTION 'A demo facility name/code is already assigned to a different facility; refusing to modify it.';
  END IF;
END;
$site_preflight$;

INSERT INTO public.sites (organization_id, name, code, address, latitude, longitude)
SELECT demo.id, expected.name, expected.code, expected.address, expected.latitude, expected.longitude
FROM _sentinel_demo_sites expected
CROSS JOIN _sentinel_demo_org demo
ON CONFLICT (organization_id, code) DO NOTHING;

INSERT INTO public.facilities (organization_id, site_id, name, code)
SELECT demo.id, site.id, expected.facility_name, expected.facility_code
FROM _sentinel_demo_sites expected
CROSS JOIN _sentinel_demo_org demo
JOIN public.sites site ON site.organization_id = demo.id AND site.code = expected.code
ON CONFLICT (organization_id, code) DO NOTHING;

CREATE TEMP TABLE _sentinel_demo_site_map ON COMMIT DROP AS
SELECT expected.site_order, site.id AS site_id, facility.id AS facility_id,
       site.latitude, site.longitude,
       expected.name AS site_name, expected.facility_name
FROM _sentinel_demo_sites expected
CROSS JOIN _sentinel_demo_org demo
JOIN public.sites site ON site.organization_id = demo.id AND site.code = expected.code
JOIN public.facilities facility ON facility.organization_id = demo.id
  AND facility.code = expected.facility_code AND facility.site_id = site.id;

DO $relationship_preflight$
BEGIN
  IF (SELECT count(*) FROM _sentinel_demo_site_map) <> 8 THEN
    RAISE EXCEPTION 'Expected eight demo site/facility pairs in the demo organization.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM _sentinel_demo_users user_seed
    JOIN public.profiles profile ON profile.id = user_seed.user_id
    WHERE profile.organization_id <> (SELECT id FROM _sentinel_demo_org)
  ) THEN
    RAISE EXCEPTION 'A demo Auth user already has a profile in another organization; refusing to move it.';
  END IF;
END;
$relationship_preflight$;

INSERT INTO public.profiles (
  id, organization_id, employee_id, full_name, department, job_title, phone,
  emergency_contact, site_location, supervisor, certification_status,
  employment_type, account_status
)
SELECT user_seed.user_id, demo.id, user_seed.employee_id, user_seed.full_name,
       user_seed.department, user_seed.job_title,
       '+234801234' || lpad(user_seed.user_order::text, 4, '0'),
       NULL, user_seed.site_name, 'Adebayo Adeyemi', 'Current',
       user_seed.employment_type, 'active'
FROM _sentinel_demo_users user_seed
CROSS JOIN _sentinel_demo_org demo
ON CONFLICT (id) DO UPDATE SET
  employee_id = EXCLUDED.employee_id,
  full_name = EXCLUDED.full_name,
  department = EXCLUDED.department,
  job_title = EXCLUDED.job_title,
  phone = EXCLUDED.phone,
  site_location = EXCLUDED.site_location,
  supervisor = EXCLUDED.supervisor,
  certification_status = EXCLUDED.certification_status,
  employment_type = EXCLUDED.employment_type,
  account_status = 'active'
WHERE public.profiles.organization_id = EXCLUDED.organization_id;

INSERT INTO public.memberships (user_id, organization_id, role)
SELECT user_seed.user_id, demo.id, user_seed.role::public.membership_role
FROM _sentinel_demo_users user_seed
CROSS JOIN _sentinel_demo_org demo
ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.notification_preferences (
  user_id, email, sms, push, incident_assignments,
  corrective_action_reminders, audit_reminders
)
SELECT user_id, true, false, true, true, true, true
FROM _sentinel_demo_users
ON CONFLICT (user_id) DO NOTHING;

CREATE TEMP TABLE _sentinel_demo_scenarios (
  scenario_order integer PRIMARY KEY,
  weight integer NOT NULL,
  category text NOT NULL,
  report_type public.incident_report_type NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  immediate_correction text NOT NULL,
  root_cause text NOT NULL,
  environmental_impact boolean NOT NULL,
  injury_or_illness boolean NOT NULL,
  property_damage boolean NOT NULL,
  equipment_involved text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sentinel_demo_scenarios VALUES
  (1, 15, 'Near Miss', 'near_miss', 'Forklift stopped before a pedestrian crossing', 'A banksman signalled the forklift operator to stop as a worker approached the marked crossing. No contact occurred, and the movement plan was reviewed before work resumed.', 'The crossing was held clear and the operator was briefed.', 'Vehicle and pedestrian interface control', false, false, false, 'Forklift and pedestrian barrier'),
  (2, 14, 'Unsafe Condition', 'unsafe_condition', 'Damaged electrical cable identified before use', 'A pre-use check found worn insulation near a portable tool connection in the workshop. The tool was isolated and tagged out pending repair.', 'The tool was isolated and removed from service.', 'Equipment inspection and maintenance control', false, false, false, 'Portable electrical tool'),
  (3, 12, 'Unsafe Act', 'unsafe_act', 'Required eye protection not worn during grinding preparation', 'A technician began task preparation without the required eye protection. Work was paused before the tool was started and the supervisor reviewed the PPE requirement.', 'Work was paused and suitable eye protection was provided.', 'Task preparation and PPE compliance', false, false, false, 'Grinding equipment and PPE'),
  (4, 9, 'Environmental Incident', 'environmental_incident', 'Small diesel spill contained beside a generator', 'A minor fuel leak was observed beneath a generator during routine rounds. Absorbent material was used and contaminated waste was segregated for disposal.', 'The leak was contained and the generator was isolated for inspection.', 'Equipment condition and spill prevention', true, false, false, 'Diesel generator and spill kit'),
  (5, 7, 'Vehicle / Transportation Incident', 'incident', 'Delivery vehicle reversed without a designated banksman', 'A delivery vehicle began reversing in a congested yard without a designated banksman. The driver stopped when signalled and a spotter was assigned.', 'The manoeuvre was stopped until a spotter was in position.', 'Traffic management and reversing controls', false, false, true, 'Delivery vehicle'),
  (6, 6, 'Property / Equipment Damage', 'incident', 'Hydraulic hose leak found during equipment inspection', 'An inspection identified hydraulic fluid escaping from a hose connection before the equipment was returned to service. The affected area was protected and maintenance was notified.', 'Equipment was tagged out and the fluid was cleaned using the site spill procedure.', 'Preventive maintenance and hose condition', true, false, true, 'Hydraulic hose and mobile equipment'),
  (7, 6, 'Injury / Illness', 'incident', 'Worker sustained a minor hand injury during maintenance', 'A worker reported a small hand cut while handling a component after maintenance work. First aid was provided and the task team reviewed glove selection and handling technique.', 'First aid was provided and the task was paused for review.', 'Manual handling and task-specific PPE', false, true, false, 'Maintenance hand tools'),
  (8, 6, 'Incident', 'incident', 'Worker slipped on a wet surface near the workshop', 'A worker lost footing on a wet patch near the workshop entrance and reported discomfort. The area was cordoned off while the source of the water was investigated.', 'The area was isolated, dried and checked before reopening.', 'Housekeeping and access conditions', false, true, false, 'Workshop access route'),
  (9, 5, 'Process Safety Incident', 'incident', 'Gas detector alarm activated during a field inspection', 'A portable gas detector alarm activated during a routine field inspection. The team withdrew to the muster point and the area was checked before controlled re-entry.', 'Personnel withdrew and the emergency response procedure was followed.', 'Process monitoring and hazardous-area controls', false, false, false, 'Portable gas detector'),
  (10, 4, 'Chemical / Hazardous Substance', 'unsafe_condition', 'Chemical container found without a secondary label', 'A decanted container in the maintenance store lacked the required secondary label. It was segregated until its contents and handling information could be verified.', 'The container was isolated pending identification and relabelling.', 'Chemical identification and storage control', true, false, false, 'Chemical storage container'),
  (11, 4, 'Electrical Incident', 'unsafe_condition', 'Temporary electrical lead routed across a walkway', 'A temporary lead crossed a pedestrian route near a work area. The team rerouted it and inspected the lead and protection before use continued.', 'The cable was rerouted and protected from foot traffic.', 'Temporary power and access management', false, false, false, 'Temporary electrical lead'),
  (12, 3, 'Lifting / Dropped Object', 'near_miss', 'Loose material shifted during a controlled lift', 'A timber spacer moved as a load was raised a short distance. The operator lowered the load safely and the lifting team reset the spacers under the lift plan.', 'The load was lowered and the lift arrangement was rechecked.', 'Load preparation and lifting supervision', false, false, true, 'Lifting gear and load'),
  (13, 3, 'Working at Height', 'unsafe_condition', 'Unsecured material observed at an elevated work area', 'A loose item was found near the edge of an elevated work platform. Access below was restricted while the item was secured and the work area was inspected.', 'The exclusion zone was maintained until the platform was made safe.', 'Dropped-object prevention and work-at-height controls', false, false, false, 'Elevated work platform'),
  (14, 2, 'Confined Space', 'unsafe_condition', 'Confined-space entry checklist missing a gas-test sign-off', 'A pre-entry review found that the gas-test result had not been recorded on the entry checklist. Entry was held until the test and permit documentation were complete.', 'Entry was stopped pending gas testing and permit verification.', 'Permit-to-work and confined-space verification', false, false, false, 'Gas detector and entry permit'),
  (15, 2, 'Fire / Explosion', 'incident', 'Fire extinguisher found partially obstructed', 'Routine rounds found stored materials limiting access to a fire extinguisher near a workshop bay. The obstruction was removed and the equipment was checked.', 'The access route was cleared and the extinguisher inspected.', 'Emergency equipment access and housekeeping', false, false, false, 'Fire extinguisher and workshop storage'),
  (16, 1, 'Security Incident', 'incident', 'Restricted work area entered without a current access check', 'A person entered a restricted work area before the access check was completed. The site contact escorted the person out and reviewed the entry control.', 'The area was secured and access was revalidated.', 'Access authorization and site security', false, false, false, 'Access-control point'),
  (17, 1, 'Occupational Health', 'incident', 'Elevated noise reading recorded during workshop monitoring', 'A monitoring check recorded elevated noise at a workshop station during equipment operation. The team reviewed exposure controls and hearing protection requirements.', 'Exposure controls and hearing protection were reviewed with the team.', 'Exposure monitoring and occupational-health controls', false, false, false, 'Workshop machinery');

DO $scenario_check$
BEGIN
  IF (SELECT sum(weight) FROM _sentinel_demo_scenarios) <> 100 THEN
    RAISE EXCEPTION 'Demo incident scenario weights must total 100.';
  END IF;
END;
$scenario_check$;

CREATE TEMP TABLE _sentinel_demo_incident_rows ON COMMIT DROP AS
WITH
  scenario_ranges AS (
    SELECT scenario.*,
           sum(weight) OVER (ORDER BY scenario_order) AS upper_bound
    FROM _sentinel_demo_scenarios scenario
  ),
  generated AS (
    SELECT
      sequence_no,
      (('x' || substr(md5('sentinelqhse-demo-v1:category:' || sequence_no::text), 1, 8))::bit(32)::bigint % 100)::integer + 1 AS category_bucket,
      (('x' || substr(md5('sentinelqhse-demo-v1:status:' || sequence_no::text), 1, 8))::bit(32)::bigint % 100)::integer AS status_bucket,
      (('x' || substr(md5('sentinelqhse-demo-v1:severity:' || sequence_no::text), 1, 8))::bit(32)::bigint % 100)::integer AS severity_bucket,
      (('x' || substr(md5('sentinelqhse-demo-v1:potential:' || sequence_no::text), 1, 8))::bit(32)::bigint % 100)::integer AS potential_bucket,
      (('x' || substr(md5('sentinelqhse-demo-v1:reporter:' || sequence_no::text), 1, 8))::bit(32)::bigint % 20)::integer + 1 AS reporter_order,
      (('x' || substr(md5('sentinelqhse-demo-v1:site:' || sequence_no::text), 1, 8))::bit(32)::bigint % 8)::integer + 1 AS site_order,
      (('x' || substr(md5('sentinelqhse-demo-v1:shift:' || sequence_no::text), 1, 8))::bit(32)::bigint % 3)::integer + 1 AS shift_order,
      (('x' || substr(md5('sentinelqhse-demo-v1:department:' || sequence_no::text), 1, 8))::bit(32)::bigint % 10)::integer + 1 AS department_order,
      (('x' || substr(md5('sentinelqhse-demo-v1:time:' || sequence_no::text), 1, 8))::bit(32)::bigint % 48)::integer + 1 AS reporting_delay_hours,
      (('x' || substr(md5('sentinelqhse-demo-v1:title:' || sequence_no::text), 1, 8))::bit(32)::bigint % 6)::integer + 1 AS title_variant,
      (('x' || substr(md5('sentinelqhse-demo-v1:description:' || sequence_no::text), 1, 8))::bit(32)::bigint % 5)::integer + 1 AS detail_variant,
      (('x' || substr(md5('sentinelqhse-demo-v1:contractor:' || sequence_no::text), 1, 8))::bit(32)::bigint % 100)::integer AS contractor_bucket
    FROM generate_series(1, 1200) AS generated_sequence(sequence_no)
  ),
  selected AS (
    SELECT generated.*, scenario.category, scenario.report_type, scenario.title AS scenario_title,
           scenario.description, scenario.immediate_correction, scenario.root_cause,
           scenario.environmental_impact, scenario.injury_or_illness,
           scenario.property_damage, scenario.equipment_involved
    FROM generated
    JOIN scenario_ranges scenario
      ON generated.category_bucket > scenario.upper_bound - scenario.weight
     AND generated.category_bucket <= scenario.upper_bound
  ),
  joined AS (
    SELECT selected.*,
           user_seed.user_id AS reporter_id,
           user_seed.full_name AS reporter_name,
           user_seed.department AS reporter_department,
           site.site_id, site.facility_id, site.site_name, site.facility_name,
           site.latitude, site.longitude,
           department.name AS department_name,
           shift.value->>'name' AS shift_name,
           (
             timestamptz '2023-09-29 00:00:00+00'
             + (timestamptz '2026-09-29 23:59:59+00' - timestamptz '2023-09-29 00:00:00+00')
               * ((selected.sequence_no - 1)::double precision / 1199.0)
           ) AS occurred_at
    FROM selected
    JOIN _sentinel_demo_users user_seed ON user_seed.user_order = selected.reporter_order
    JOIN _sentinel_demo_site_map site ON site.site_order = selected.site_order
    JOIN (
      SELECT name, row_number() OVER (ORDER BY name)::integer AS department_order
      FROM _sentinel_demo_departments
    ) department ON department.department_order = selected.department_order
    JOIN (
      SELECT value, row_number() OVER (ORDER BY setting_order)::integer AS shift_order
      FROM _sentinel_demo_config WHERE setting_key = 'shifts'
    ) shift ON shift.shift_order = selected.shift_order
  ),
  dated AS (
    SELECT joined.*,
           LEAST(
             occurred_at + make_interval(hours => reporting_delay_hours),
             timestamptz '2026-09-29 23:59:59+00'
           ) AS reported_at
    FROM joined
  ),
  categorized AS (
    SELECT dated.*,
           CASE
             WHEN occurred_at >= timestamptz '2026-08-31 23:59:59+00' THEN
               CASE WHEN status_bucket < 45 THEN 'submitted'
                    WHEN status_bucket < 80 THEN 'under_review'
                    ELSE 'investigation' END
             WHEN status_bucket < 55 THEN 'closed'
             WHEN status_bucket < 65 THEN 'submitted'
             WHEN status_bucket < 75 THEN 'under_review'
             WHEN status_bucket < 85 THEN 'investigation'
             WHEN status_bucket < 95 THEN 'corrective_action'
             ELSE 'pending_verification'
           END AS incident_status,
           CASE WHEN severity_bucket < 60 THEN 'low'
                WHEN severity_bucket < 90 THEN 'medium'
                WHEN severity_bucket < 99 THEN 'high'
                ELSE 'critical' END AS severity_name,
           CASE WHEN potential_bucket < 48 THEN 'low'
                WHEN potential_bucket < 81 THEN 'medium'
                WHEN potential_bucket < 97 THEN 'high'
                ELSE 'critical' END AS potential_severity_name
    FROM dated
  )
SELECT
  sequence_no,
  (
    substr(md5('sentinelqhse-demo-v1:incident:' || sequence_no::text), 1, 8) || '-' ||
    substr(md5('sentinelqhse-demo-v1:incident:' || sequence_no::text), 9, 4) || '-' ||
    substr(md5('sentinelqhse-demo-v1:incident:' || sequence_no::text), 13, 4) || '-' ||
    substr(md5('sentinelqhse-demo-v1:incident:' || sequence_no::text), 17, 4) || '-' ||
    substr(md5('sentinelqhse-demo-v1:incident:' || sequence_no::text), 21, 12)
  )::uuid AS id,
  (SELECT id FROM _sentinel_demo_org) AS organization_id,
  NULL::text AS reference_number,
  report_type,
  incident_status::public.incident_status AS status,
  scenario_title || CASE title_variant
    WHEN 1 THEN ' during routine rounds'
    WHEN 2 THEN ' at shift handover'
    WHEN 3 THEN ' during planned maintenance'
    WHEN 4 THEN ' before equipment start-up'
    WHEN 5 THEN ' during materials handling'
    ELSE ' while preparing the work area'
  END AS title,
  description || CASE detail_variant
    WHEN 1 THEN ' The supervisor briefed the incoming shift and recorded the agreed follow-up.'
    WHEN 2 THEN ' The team checked the relevant work control before the activity continued.'
    WHEN 3 THEN ' The area remained controlled until the responsible department completed its check.'
    WHEN 4 THEN ' The reporter notified the site contact and retained the inspection record.'
    ELSE ' The response was reviewed at the next toolbox talk to reduce the chance of recurrence.'
  END AS description,
  occurred_at,
  reported_at,
  site_id,
  facility_id,
  facility_name || ', ' || site_name AS location,
  department_name AS department,
  shift_name AS shift,
  department_name || ' activity on ' || lower(shift_name) || ' at ' || site_name || '.' AS work_activity_context,
  reporter_id AS reported_by,
  reporter_id AS created_by,
  contractor_bucket < 22 AS contractor_involved,
  CASE WHEN contractor_bucket < 22
       THEN (ARRAY['Coastal Technical Services', 'Delta Marine Support', 'Atlantic Industrial Partners'])
              [((sequence_no - 1) % 3) + 1]
       ELSE NULL END AS contractor_organization,
  severity_name AS severity,
  potential_severity_name AS potential_severity,
  category AS incident_category,
  environmental_impact,
  injury_or_illness,
  property_damage,
  true AS work_related,
  immediate_correction,
  CASE WHEN severity_name IN ('high', 'critical') THEN 'high' ELSE severity_name END AS priority,
  latitude::text || ', ' || longitude::text AS gps_coordinates,
  (ARRAY['Warm and dry', 'Light rain', 'Humid with moderate wind', 'Overcast'])
    [((sequence_no - 1) % 4) + 1] AS weather_conditions,
  equipment_involved,
  reporter_name || '; ' || (ARRAY['operator', 'technician', 'site supervisor', 'contractor representative'])
    [((sequence_no - 1) % 4) + 1] AS people_involved,
  CASE WHEN sequence_no % 3 = 0
       THEN (SELECT full_name FROM _sentinel_demo_users WHERE user_order = ((sequence_no % 20) + 1))
       ELSE NULL END AS witnesses,
  root_cause AS potential_root_cause,
  'DEMO-SEED:sentinelqhse-v1'::text AS digital_signature,
  true AS accuracy_confirmed,
  3 AS draft_stage,
  reported_at AS created_at,
  reported_at AS updated_at,
  reporter_name,
  site_name,
  facility_name,
  reporter_id,
  severity_name,
  incident_status
FROM categorized;

DO $incident_collision_check$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM _sentinel_demo_incident_rows expected
    JOIN public.incidents existing ON existing.id = expected.id
    WHERE existing.organization_id <> expected.organization_id
       OR existing.digital_signature IS DISTINCT FROM 'DEMO-SEED:sentinelqhse-v1'
  ) THEN
    RAISE EXCEPTION 'A generated demo incident ID belongs to a non-seed record; refusing to overwrite it.';
  END IF;
END;
$incident_collision_check$;

INSERT INTO public.incidents (
  id, organization_id, reference_number, report_type, status, title, description,
  occurred_at, reported_at, site_id, facility_id, location, department, shift,
  work_activity_context, reported_by, created_by, contractor_involved,
  contractor_organization, severity, potential_severity, incident_category,
  environmental_impact, injury_or_illness, property_damage, work_related,
  immediate_correction, priority, gps_coordinates, weather_conditions,
  equipment_involved, people_involved, witnesses, potential_root_cause,
  digital_signature, accuracy_confirmed, draft_stage, created_at, updated_at
)
SELECT
  id, organization_id, reference_number, report_type, status, title, description,
  occurred_at, reported_at, site_id, facility_id, location, department, shift,
  work_activity_context, reported_by, created_by, contractor_involved,
  contractor_organization, severity, potential_severity, incident_category,
  environmental_impact, injury_or_illness, property_damage, work_related,
  immediate_correction, priority, gps_coordinates, weather_conditions,
  equipment_involved, people_involved, witnesses, potential_root_cause,
  digital_signature, accuracy_confirmed, draft_stage, created_at, updated_at
FROM _sentinel_demo_incident_rows
WHERE NOT EXISTS (
  SELECT 1 FROM public.incidents existing WHERE existing.id = _sentinel_demo_incident_rows.id
)
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE _sentinel_demo_incident_map ON COMMIT DROP AS
SELECT
  seeded.sequence_no, incident.id, incident.organization_id, incident.report_type,
  incident.status, incident.title, incident.description, incident.occurred_at,
  incident.reported_at, incident.site_id, incident.facility_id, incident.location,
  incident.department, incident.shift, incident.severity, incident.incident_category,
  incident.reported_by, incident.created_by, incident.injury_or_illness,
  incident.contractor_involved, incident.contractor_organization
FROM _sentinel_demo_incident_rows seeded
JOIN public.incidents incident ON incident.id = seeded.id
WHERE incident.organization_id = seeded.organization_id
  AND incident.digital_signature = 'DEMO-SEED:sentinelqhse-v1';

CREATE TEMP TABLE _sentinel_demo_draft_rows ON COMMIT DROP AS
SELECT
  sequence_no,
  (
    substr(md5('sentinelqhse-demo-v1:draft:' || sequence_no::text), 1, 8) || '-' ||
    substr(md5('sentinelqhse-demo-v1:draft:' || sequence_no::text), 9, 4) || '-' ||
    substr(md5('sentinelqhse-demo-v1:draft:' || sequence_no::text), 13, 4) || '-' ||
    substr(md5('sentinelqhse-demo-v1:draft:' || sequence_no::text), 17, 4) || '-' ||
    substr(md5('sentinelqhse-demo-v1:draft:' || sequence_no::text), 21, 12)
  )::uuid AS id,
  (SELECT id FROM _sentinel_demo_org) AS organization_id,
  NULL::text AS reference_number,
  (ARRAY['near_miss', 'unsafe_condition', 'unsafe_act', 'environmental_incident', 'incident'])
    [((sequence_no - 1) % 5) + 1]::public.incident_report_type AS report_type,
  'draft'::public.incident_status AS status,
  (ARRAY[
    'Equipment condition awaiting supervisor details',
    'Work area observation awaiting initial review',
    'Early event notes recorded for completion',
    'Field observation awaiting reporter follow-up',
    'Initial safety report details being gathered'
  ])[((sequence_no - 1) % 5) + 1] AS title,
  NULL::text AS description,
  (timestamptz '2026-09-01 08:00:00+00' + make_interval(days => sequence_no, hours => sequence_no * 3)) AS occurred_at,
  NULL::timestamptz AS reported_at,
  NULL::uuid AS site_id,
  NULL::uuid AS facility_id,
  NULL::text AS location,
  NULL::text AS department,
  NULL::text AS shift,
  NULL::text AS work_activity_context,
  user_seed.user_id AS reported_by,
  user_seed.user_id AS created_by,
  false AS contractor_involved,
  NULL::text AS contractor_organization,
  NULL::text AS severity,
  NULL::text AS potential_severity,
  NULL::text AS incident_category,
  false AS environmental_impact,
  false AS injury_or_illness,
  false AS property_damage,
  true AS work_related,
  NULL::text AS immediate_correction,
  NULL::text AS priority,
  NULL::text AS gps_coordinates,
  NULL::text AS weather_conditions,
  NULL::text AS equipment_involved,
  NULL::text AS people_involved,
  NULL::text AS witnesses,
  NULL::text AS potential_root_cause,
  'DEMO-SEED:sentinelqhse-v1'::text AS digital_signature,
  false AS accuracy_confirmed,
  sequence_no % 4 AS draft_stage,
  timestamptz '2026-09-01 08:00:00+00' + make_interval(days => sequence_no, hours => sequence_no * 3) AS created_at,
  timestamptz '2026-09-01 08:00:00+00' + make_interval(days => sequence_no, hours => sequence_no * 3) AS updated_at
FROM generate_series(1, 15) AS generated_draft(sequence_no)
JOIN _sentinel_demo_users user_seed ON user_seed.user_order = ((sequence_no * 3 - 1) % 20) + 1;

DO $draft_collision_check$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM _sentinel_demo_draft_rows expected
    JOIN public.incidents existing ON existing.id = expected.id
    WHERE existing.organization_id <> expected.organization_id
       OR existing.digital_signature IS DISTINCT FROM 'DEMO-SEED:sentinelqhse-v1'
  ) THEN
    RAISE EXCEPTION 'A generated demo draft ID belongs to a non-seed record; refusing to overwrite it.';
  END IF;
END;
$draft_collision_check$;

INSERT INTO public.incidents (
  id, organization_id, reference_number, report_type, status, title, description,
  occurred_at, reported_at, site_id, facility_id, location, department, shift,
  work_activity_context, reported_by, created_by, contractor_involved,
  contractor_organization, severity, potential_severity, incident_category,
  environmental_impact, injury_or_illness, property_damage, work_related,
  immediate_correction, priority, gps_coordinates, weather_conditions,
  equipment_involved, people_involved, witnesses, potential_root_cause,
  digital_signature, accuracy_confirmed, draft_stage, created_at, updated_at
)
SELECT
  id, organization_id, reference_number, report_type, status, title, description,
  occurred_at, reported_at, site_id, facility_id, location, department, shift,
  work_activity_context, reported_by, created_by, contractor_involved,
  contractor_organization, severity, potential_severity, incident_category,
  environmental_impact, injury_or_illness, property_damage, work_related,
  immediate_correction, priority, gps_coordinates, weather_conditions,
  equipment_involved, people_involved, witnesses, potential_root_cause,
  digital_signature, accuracy_confirmed, draft_stage, created_at, updated_at
FROM _sentinel_demo_draft_rows
WHERE NOT EXISTS (
  SELECT 1 FROM public.incidents existing WHERE existing.id = _sentinel_demo_draft_rows.id
)
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE _sentinel_demo_investigation_rows ON COMMIT DROP AS
SELECT
  incident.sequence_no,
  (
    substr(md5('sentinelqhse-demo-v1:investigation:' || incident.sequence_no::text), 1, 8) || '-' ||
    substr(md5('sentinelqhse-demo-v1:investigation:' || incident.sequence_no::text), 9, 4) || '-' ||
    substr(md5('sentinelqhse-demo-v1:investigation:' || incident.sequence_no::text), 13, 4) || '-' ||
    substr(md5('sentinelqhse-demo-v1:investigation:' || incident.sequence_no::text), 17, 4) || '-' ||
    substr(md5('sentinelqhse-demo-v1:investigation:' || incident.sequence_no::text), 21, 12)
  )::uuid AS id,
  incident.organization_id,
  incident.id AS incident_id,
  CASE incident.status
    WHEN 'closed' THEN 'completed'
    WHEN 'corrective_action' THEN 'completed'
    WHEN 'pending_verification' THEN 'completed'
    WHEN 'investigation' THEN 'in_progress'
    WHEN 'under_review' THEN 'pending_review'
    ELSE 'assigned'
  END::public.investigation_status AS status,
  qhse.user_id AS assigned_investigator_id,
  administrator.user_id AS investigation_lead_id,
  administrator.user_id AS assigned_by,
  incident.reported_at + interval '1 hour' AS assigned_at,
  incident.reported_at + interval '2 hours' AS started_at,
  (incident.reported_at::date + 14) AS target_completion_date,
  CASE WHEN incident.status IN ('closed', 'corrective_action', 'pending_verification')
       THEN incident.reported_at + interval '7 days' ELSE NULL END AS completed_at,
  'The review examined the reported ' || lower(incident.incident_category)
    || ' and confirmed the event timeline with the site team.' AS investigation_summary,
  'Contributing factors were reviewed against the local work conditions and task controls.' AS findings_summary,
  CASE WHEN incident.status IN ('closed', 'corrective_action', 'pending_verification')
       THEN 'Immediate controls were verified and follow-up actions were assigned to the responsible role.'
       ELSE NULL END AS conclusions,
  administrator.user_id AS created_by,
  incident.reported_at + interval '1 hour' AS created_at
FROM _sentinel_demo_incident_map incident
CROSS JOIN _sentinel_demo_users administrator
CROSS JOIN _sentinel_demo_users qhse
WHERE incident.sequence_no % 5 <> 0
  AND administrator.role = 'Super Administrator'
  AND qhse.role = 'QHSE Manager';

INSERT INTO public.investigations (
  id, organization_id, incident_id, status, assigned_investigator_id,
  investigation_lead_id, assigned_by, assigned_at, started_at,
  target_completion_date, completed_at, investigation_summary,
  findings_summary, conclusions, created_by, created_at
)
SELECT
  id, organization_id, incident_id, status, assigned_investigator_id,
  investigation_lead_id, assigned_by, assigned_at, started_at,
  target_completion_date, completed_at, investigation_summary,
  findings_summary, conclusions, created_by, created_at
FROM _sentinel_demo_investigation_rows
WHERE NOT EXISTS (
  SELECT 1 FROM public.investigations existing
  WHERE existing.organization_id = _sentinel_demo_investigation_rows.organization_id
    AND existing.incident_id = _sentinel_demo_investigation_rows.incident_id
)
ON CONFLICT (organization_id, incident_id) DO NOTHING;

CREATE TEMP TABLE _sentinel_demo_investigation_map ON COMMIT DROP AS
SELECT seeded.sequence_no, investigation.id AS investigation_id,
       investigation.organization_id, investigation.incident_id
FROM _sentinel_demo_investigation_rows seeded
JOIN public.investigations investigation
  ON investigation.organization_id = seeded.organization_id
 AND investigation.incident_id = seeded.incident_id;

CREATE TEMP TABLE _sentinel_demo_action_rows ON COMMIT DROP AS
WITH action_candidates AS (
  SELECT incident.*,
         owner.user_id AS owner_id,
         administrator.user_id AS actor_id,
         investigation.investigation_id,
         (
           substr(md5('sentinelqhse-demo-v1:action:' || incident.sequence_no::text), 1, 8) || '-' ||
           substr(md5('sentinelqhse-demo-v1:action:' || incident.sequence_no::text), 9, 4) || '-' ||
           substr(md5('sentinelqhse-demo-v1:action:' || incident.sequence_no::text), 13, 4) || '-' ||
           substr(md5('sentinelqhse-demo-v1:action:' || incident.sequence_no::text), 17, 4) || '-' ||
           substr(md5('sentinelqhse-demo-v1:action:' || incident.sequence_no::text), 21, 12)
         )::uuid AS action_id,
         (('x' || substr(md5('sentinelqhse-demo-v1:action-status:' || incident.sequence_no::text), 1, 8))::bit(32)::bigint % 100)::integer AS status_bucket,
         (('x' || substr(md5('sentinelqhse-demo-v1:action-title:' || incident.sequence_no::text), 1, 8))::bit(32)::bigint % 12)::integer + 1 AS title_order
  FROM _sentinel_demo_incident_map incident
  JOIN _sentinel_demo_users owner ON owner.user_id = incident.reported_by
  CROSS JOIN _sentinel_demo_users administrator
  LEFT JOIN _sentinel_demo_investigation_map investigation ON investigation.sequence_no = incident.sequence_no
  WHERE incident.sequence_no % 4 <> 0
    AND administrator.role = 'QHSE Manager'
),
dated AS (
  SELECT candidate.*,
         incident.reported_at + interval '1 day' AS action_created_at,
         CASE
           WHEN incident.occurred_at >= timestamptz '2026-08-31 23:59:59+00' THEN
             CASE WHEN candidate.status_bucket < 50 THEN 'open'
                  WHEN candidate.status_bucket < 90 THEN 'in_progress'
                  ELSE 'pending_verification' END
           WHEN incident.status = 'closed' THEN 'verified'
           WHEN incident.status = 'pending_verification' THEN
             CASE WHEN candidate.status_bucket < 80 THEN 'verified' ELSE 'pending_verification' END
           WHEN incident.status = 'corrective_action' THEN
             CASE WHEN candidate.status_bucket < 45 THEN 'in_progress'
                  WHEN candidate.status_bucket < 80 THEN 'pending_verification'
                  ELSE 'verified' END
           WHEN incident.status = 'investigation' THEN
             CASE WHEN candidate.status_bucket < 70 THEN 'open' ELSE 'in_progress' END
           ELSE CASE WHEN candidate.status_bucket < 70 THEN 'open' ELSE 'in_progress' END
         END AS action_status
  FROM action_candidates candidate
  JOIN _sentinel_demo_incident_map incident ON incident.sequence_no = candidate.sequence_no
)
SELECT
  dated.sequence_no, dated.action_id AS id,
  dated.organization_id, dated.incident_id, dated.investigation_id,
  (ARRAY[
    'Conduct a task-specific toolbox talk',
    'Replace the damaged equipment before returning it to service',
    'Repair and pressure-test the hydraulic hose',
    'Improve housekeeping and maintain a clear access route',
    'Install warning signage at the controlled work area',
    'Conduct refresher training on the safe work procedure',
    'Review the task risk assessment with the work team',
    'Update the safe work procedure and brief affected personnel',
    'Improve PPE compliance through supervisor pre-task checks',
    'Repair the electrical installation and complete an inspection',
    'Introduce an additional documented equipment inspection',
    'Restrict access until the identified hazard is controlled'
  ])[dated.title_order] AS title,
  'SentinelQHSE demo seed v1: ' || (
    CASE dated.title_order
      WHEN 1 THEN 'Deliver and record a focused toolbox talk for the affected crew.'
      WHEN 2 THEN 'Remove the item from service, replace it and retain the inspection record.'
      WHEN 3 THEN 'Complete the repair and verify the equipment before release.'
      WHEN 4 THEN 'Assign housekeeping responsibility and verify the route during shift checks.'
      WHEN 5 THEN 'Fit and inspect suitable warning signage before the next work period.'
      WHEN 6 THEN 'Complete refresher coaching and record attendance.'
      WHEN 7 THEN 'Review control effectiveness and brief the responsible supervisor.'
      WHEN 8 THEN 'Issue the controlled procedure revision and record team acknowledgement.'
      WHEN 9 THEN 'Reinforce task-specific PPE requirements during pre-start checks.'
      WHEN 10 THEN 'Complete repairs and document the electrical safety inspection.'
      WHEN 11 THEN 'Add a targeted check to the relevant inspection schedule.'
      ELSE 'Maintain the exclusion until the responsible supervisor verifies controls.'
    END
  ) AS description,
  (ARRAY['training', 'equipment', 'maintenance', 'housekeeping', 'work control'])
    [((dated.sequence_no - 1) % 5) + 1] AS action_category,
  CASE WHEN dated.status_bucket < 8 THEN 'high'::public.corrective_action_priority
       WHEN dated.status_bucket < 55 THEN 'medium'::public.corrective_action_priority
       ELSE 'low'::public.corrective_action_priority END AS priority,
  dated.action_status::public.corrective_action_status AS status,
  dated.owner_id AS assigned_owner_id,
  dated.actor_id AS assigned_by,
  dated.action_created_at AS assigned_at,
  dated.action_created_at::date + 14 AS due_date,
  CASE WHEN dated.action_status = 'verified' THEN dated.action_created_at::date + 8 ELSE NULL END AS completion_date,
  CASE WHEN dated.action_status = 'verified' THEN 'verified' ELSE NULL END AS verification_status,
  CASE WHEN dated.action_status = 'verified' THEN dated.action_created_at + interval '8 days' ELSE NULL END AS verification_date,
  CASE WHEN dated.action_status = 'verified' THEN dated.actor_id ELSE NULL END AS verified_by,
  CASE WHEN dated.action_status = 'verified' THEN 'Demo verification completed after follow-up review.' ELSE NULL END AS verification_notes,
  dated.actor_id AS created_by,
  dated.action_created_at AS created_at,
  dated.action_created_at AS updated_at
FROM dated;

DO $action_collision_check$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM _sentinel_demo_action_rows expected
    JOIN public.corrective_actions existing ON existing.id = expected.id
    WHERE existing.organization_id <> expected.organization_id
       OR existing.incident_id <> expected.incident_id
       OR existing.description NOT LIKE 'SentinelQHSE demo seed v1:%'
  ) THEN
    RAISE EXCEPTION 'A generated demo corrective-action ID belongs to a non-seed record; refusing to overwrite it.';
  END IF;
END;
$action_collision_check$;

INSERT INTO public.corrective_actions (
  id, organization_id, reference_number, incident_id, investigation_id, title,
  description, action_category, priority, status, assigned_owner_id, assigned_by,
  assigned_at, due_date, completion_date, verification_status, verification_date,
  verified_by, verification_notes, created_by, created_at, updated_at
)
SELECT
  action.id, action.organization_id, NULL, action.incident_id, action.investigation_id,
  action.title, action.description, action.action_category, action.priority, action.status,
  action.assigned_owner_id, action.assigned_by, action.assigned_at, action.due_date,
  action.completion_date, action.verification_status, action.verification_date,
  action.verified_by, action.verification_notes, action.created_by, action.created_at,
  action.updated_at
FROM _sentinel_demo_action_rows action
WHERE NOT EXISTS (
  SELECT 1 FROM public.corrective_actions existing WHERE existing.id = action.id
)
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE _sentinel_demo_action_map ON COMMIT DROP AS
SELECT seeded.sequence_no, action.id AS action_id, action.incident_id, action.organization_id,
       action.status, action.due_date, action.created_at, action.completion_date,
       action.verified_by, action.description
FROM _sentinel_demo_action_rows seeded
JOIN public.corrective_actions action ON action.id = seeded.id
WHERE action.organization_id = seeded.organization_id
  AND action.incident_id = seeded.incident_id
  AND action.description LIKE 'SentinelQHSE demo seed v1:%';

INSERT INTO public.incident_people (
  id, organization_id, incident_id, person_type, profile_id, full_name,
  organization_name, contact_details, created_at
)
SELECT
  (
    substr(md5('sentinelqhse-demo-v1:person:' || incident.sequence_no::text), 1, 8) || '-' ||
    substr(md5('sentinelqhse-demo-v1:person:' || incident.sequence_no::text), 9, 4) || '-' ||
    substr(md5('sentinelqhse-demo-v1:person:' || incident.sequence_no::text), 13, 4) || '-' ||
    substr(md5('sentinelqhse-demo-v1:person:' || incident.sequence_no::text), 17, 4) || '-' ||
    substr(md5('sentinelqhse-demo-v1:person:' || incident.sequence_no::text), 21, 12)
  )::uuid,
  incident.organization_id, incident.id,
  CASE WHEN incident.injury_or_illness THEN 'affected_person'::public.incident_person_type
       ELSE 'witness'::public.incident_person_type END,
  other_user.user_id, other_user.full_name, incident.contractor_organization,
  NULL, incident.reported_at
FROM _sentinel_demo_incident_map incident
JOIN _sentinel_demo_users other_user
  ON other_user.user_order = ((incident.sequence_no * 7 - 1) % 20) + 1
WHERE incident.sequence_no % 5 = 0
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.activity_logs (id, organization_id, user_id, activity, metadata, location, created_at)
SELECT
  (
    substr(md5('sentinelqhse-demo-v1:activity-incident:' || incident.sequence_no::text), 1, 8) || '-' ||
    substr(md5('sentinelqhse-demo-v1:activity-incident:' || incident.sequence_no::text), 9, 4) || '-' ||
    substr(md5('sentinelqhse-demo-v1:activity-incident:' || incident.sequence_no::text), 13, 4) || '-' ||
    substr(md5('sentinelqhse-demo-v1:activity-incident:' || incident.sequence_no::text), 17, 4) || '-' ||
    substr(md5('sentinelqhse-demo-v1:activity-incident:' || incident.sequence_no::text), 21, 12)
  )::uuid,
  incident.organization_id, incident.reported_by, 'Incident submitted',
  jsonb_build_object(
    'demo_seed', 'sentinelqhse-v1',
    'incident_id', incident.id,
    'report_type', incident.report_type,
    'status', incident.status
  ),
  incident.location, incident.reported_at
FROM _sentinel_demo_incident_map incident
WHERE incident.sequence_no % 8 = 0
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.activity_logs (id, organization_id, user_id, activity, metadata, location, created_at)
SELECT
  (
    substr(md5('sentinelqhse-demo-v1:activity-action:' || action.sequence_no::text), 1, 8) || '-' ||
    substr(md5('sentinelqhse-demo-v1:activity-action:' || action.sequence_no::text), 9, 4) || '-' ||
    substr(md5('sentinelqhse-demo-v1:activity-action:' || action.sequence_no::text), 13, 4) || '-' ||
    substr(md5('sentinelqhse-demo-v1:activity-action:' || action.sequence_no::text), 17, 4) || '-' ||
    substr(md5('sentinelqhse-demo-v1:activity-action:' || action.sequence_no::text), 21, 12)
  )::uuid,
  action.organization_id, action_created.created_by, 'Corrective action created',
  jsonb_build_object(
    'demo_seed', 'sentinelqhse-v1',
    'incident_id', action.incident_id,
    'corrective_action_id', action.action_id,
    'status', action.status
  ),
  incident.location, action.created_at
FROM _sentinel_demo_action_map action
JOIN _sentinel_demo_action_rows action_created ON action_created.sequence_no = action.sequence_no
JOIN _sentinel_demo_incident_map incident ON incident.id = action.incident_id
WHERE action.sequence_no % 8 = 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.activity_logs (id, organization_id, user_id, activity, metadata, location, created_at)
SELECT
  (
    substr(md5('sentinelqhse-demo-v1:activity-complete:' || action.sequence_no::text), 1, 8) || '-' ||
    substr(md5('sentinelqhse-demo-v1:activity-complete:' || action.sequence_no::text), 9, 4) || '-' ||
    substr(md5('sentinelqhse-demo-v1:activity-complete:' || action.sequence_no::text), 13, 4) || '-' ||
    substr(md5('sentinelqhse-demo-v1:activity-complete:' || action.sequence_no::text), 17, 4) || '-' ||
    substr(md5('sentinelqhse-demo-v1:activity-complete:' || action.sequence_no::text), 21, 12)
  )::uuid,
  action.organization_id, action.verified_by, 'Corrective action completed',
  jsonb_build_object(
    'demo_seed', 'sentinelqhse-v1',
    'incident_id', action.incident_id,
    'corrective_action_id', action.action_id,
    'status', action.status
  ),
  incident.location, action.created_at + interval '8 days'
FROM _sentinel_demo_action_map action
JOIN _sentinel_demo_incident_map incident ON incident.id = action.incident_id
WHERE action.status = 'verified'
  AND action.sequence_no % 20 = 1
ON CONFLICT (id) DO NOTHING;

DO $final_assertions$
BEGIN
  IF (SELECT count(*) FROM _sentinel_demo_incident_map) <> 1200 THEN
    RAISE EXCEPTION 'Expected 1,200 submitted demo incidents; found %.',
      (SELECT count(*) FROM _sentinel_demo_incident_map);
  END IF;
  IF (SELECT count(*) FROM _sentinel_demo_draft_rows) <> 15 THEN
    RAISE EXCEPTION 'Expected 15 demo drafts.';
  END IF;
  IF (SELECT count(*) FROM _sentinel_demo_action_map) <> 900 THEN
    RAISE EXCEPTION 'Expected 900 demo corrective actions; found %.',
      (SELECT count(*) FROM _sentinel_demo_action_map);
  END IF;
  IF (SELECT count(*) FROM _sentinel_demo_investigation_map) <> 960 THEN
    RAISE EXCEPTION 'Expected 960 demo investigations; found %.',
      (SELECT count(*) FROM _sentinel_demo_investigation_map);
  END IF;
  IF EXISTS (
    SELECT 1 FROM _sentinel_demo_incident_map
    WHERE occurred_at < timestamptz '2023-09-29 00:00:00+00'
       OR occurred_at > timestamptz '2026-09-29 23:59:59+00'
       OR reported_at < occurred_at
  ) THEN
    RAISE EXCEPTION 'Generated incident dates are outside the requested range or are chronologically invalid.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM _sentinel_demo_action_rows
    WHERE due_date < created_at::date
       OR (completion_date IS NOT NULL AND completion_date < created_at::date)
       OR (verification_date IS NOT NULL AND verification_date < created_at)
  ) THEN
    RAISE EXCEPTION 'Generated corrective-action dates are chronologically invalid.';
  END IF;
END;
$final_assertions$;

COMMIT;
