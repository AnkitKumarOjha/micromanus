-- Private storage bucket for generated PDF report artifacts.
-- Downloads are served through the authenticated API route
-- /api/artifacts/[artifactId] using the service-role client, so no
-- storage RLS policies are required for end users (the app checks chat
-- ownership before streaming the file).

insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;
