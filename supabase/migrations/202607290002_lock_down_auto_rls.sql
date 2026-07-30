begin;

-- Supabase creates this trigger function when automatic RLS is enabled.
-- The event trigger executes it as its owner, so API roles do not need
-- direct EXECUTE permission.
revoke all on function public.rls_auto_enable() from public;
revoke all on function public.rls_auto_enable() from anon;
revoke all on function public.rls_auto_enable() from authenticated;

commit;
