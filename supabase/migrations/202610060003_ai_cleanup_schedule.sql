create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('sentinel-ai-lifecycle-cleanup', '0 3 * * *',
  'select public.cleanup_ai_lifecycle();');
