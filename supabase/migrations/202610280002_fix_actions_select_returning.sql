-- Fix: "new row violates row-level security policy for table actions" when the
-- app creates an action (PostgREST insert with `?select=id`).
--
-- The INSERT itself succeeds. The error comes from the RETURNING step:
-- PostgreSQL applies the SELECT policy to returned rows, and the previous policy
-- used public.can_view_action(organization_id, id), which re-queries
-- public.actions for that same id. During `INSERT ... RETURNING` that lookup does
-- not see the row being inserted, so the policy evaluates false and the command
-- fails with SQLSTATE 42501.
--
-- Replacement is semantically identical (org members who can manage actions, or
-- the assignee), but checks the new row's columns directly instead of querying
-- the table again. This makes INSERT/UPDATE ... RETURNING work.
--
-- Verified against the live database: insert without RETURNING succeeded,
-- insert ... returning id failed, and the same row was selectable afterwards.

drop policy if exists actions_select_authorized on public.actions;

create policy actions_select_authorized on public.actions
for select to authenticated
using (
  public.is_org_member(organization_id)
  and (
    public.has_inspection_action_permission(organization_id, 'manage_actions')
    or assignee_id = (select auth.uid())
  )
);