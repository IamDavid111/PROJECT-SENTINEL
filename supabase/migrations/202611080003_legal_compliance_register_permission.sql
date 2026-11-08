create or replace function public.custom_role_permissions_allowed()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array[
    'view_dashboard', 'view_kpis', 'view_analytics', 'report_incident',
    'view_own_reports', 'view_all_assigned_actions', 'view_all_incidents',
    'manage_incidents', 'review_incidents', 'close_incidents', 'view_users',
    'invite_users', 'edit_users', 'suspend_users', 'deactivate_users',
    'manage_user_roles', 'view_roles_permissions', 'manage_roles_permissions',
    'view_all_reports', 'manage_reports', 'export_reports', 'manage_qhse',
    'manage_corrective_actions', 'manage_facility_risks', 'access_administration',
    'use_ai_assistant', 'view_executive_analytics', 'view_marketplace',
    'create_inspection', 'create_corrective_action', 'start_audit', 'view_reports',
    'manage_users', 'view_profile', 'view_activity', 'manage_settings',
    'view_knowledge_documents', 'manage_knowledge_documents',
    'approve_knowledge_documents', 'view_confidential_knowledge',
    'view_restricted_knowledge', 'view_policy_objectives_register',
    'manage_policy_objectives', 'view_legal_compliance_register'
  ];
$$;