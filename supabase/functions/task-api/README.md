# CRM Tasks API

Deployed to the connected CRM project after the user explicitly approved publishing this handler with `verify_jwt: false`. Application-level employee-session verification remains mandatory.

The CRM authenticates employees using HMAC-signed `x-employee-session` tokens issued by `employee-login`, rather than Supabase Auth JWTs. `task-api` verifies the signature and expiration, then checks the current employee's active status and role in the database on every request. The platform's JWT verification must be disabled for these employee sessions; application authentication remains mandatory.

Tasks and task events have RLS enabled and no browser access. Only service_role can read tables or execute task mutations. The service key never leaves the Edge Function. Mutations run in one database transaction with row locks and optimistic task versions. Regular staff see tasks assigned to them, tasks they created, and tasks where they are the named observer; administrators, general directors and directors can view all tasks. Context searches respect assigned schools; B2B-only roles can use general and driver contexts without gaining access to school or child records.

Deploy `index.ts` and `schools.ts` with the `crm_tasks`, `task_observers_and_context`, and `fix_task_observer_access` migrations already applied. School aliases in `schools.ts` mirror the catalog in `src/modules/families/constants.ts` and should be updated together when the catalog changes.

School contexts use a school → optional transfer / new or rejected application group → optional child hierarchy. An empty transfer and child means a school-wide task. Responsible employees are selected through their department. An optional observer, when selected, must be an active general director, director, senior logist or cashier; observer assignment alone allows reading and commenting, while existing leadership privileges remain unchanged. Observer changes are audited and replacing an observer revokes their participant access.

The initial release supports manual tasks, acceptance, explicit results, creator review, deadline-change reasons, comments and event history. In-app attention counts include new assignments, overdue tasks, tasks due within 24 hours, and results awaiting the creator's review. Counts refresh every minute while the CRM is open. Background notifications and automatic task generation are follow-up features.

`supabase/tests/crm_tasks.sql` validates the task lifecycle and access controls in a rolled-back transaction. Frontend tests cover task creation, rescheduling, role-specific actions, server errors and session headers.
