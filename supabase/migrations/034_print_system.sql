-- =============================================================================
-- Migration 034: Print System Foundation (Phase 15A)
-- 15 print_* settings keys + pharmacy-assets storage bucket + RLS policies
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SECTION 1 — 15 print_* settings keys with default values
-- ON CONFLICT DO NOTHING: safe for re-runs, never clobbers live values.
-- ---------------------------------------------------------------------------

INSERT INTO settings (key, value) VALUES
  ('print_logo_url',             ''),
  ('print_pharmacy_address',     ''),
  ('print_pharmacy_phone',       ''),
  ('print_pharmacy_email',       ''),
  ('print_pharmacy_license',     ''),
  ('print_footer_text',          ''),
  ('print_logo_every_page',      'false'),
  ('print_header_every_page',    'true'),
  ('print_footer_every_page',    'false'),
  ('print_show_page_numbers',    'true'),
  ('print_show_generated_date',  'true'),
  ('print_watermark_logo',       'false'),
  ('print_watermark_text',       'false'),
  ('print_watermark_text_value', 'CONFIDENTIAL'),
  ('print_watermark_opacity',    '8')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SECTION 2 — pharmacy-assets storage bucket
-- public = true: logo URL is embedded in receipts and print popups.
-- file_size_limit: 2 MB (2097152 bytes).
-- allowed_mime_types: PNG, JPEG, SVG only.
-- ON CONFLICT DO NOTHING: safe for re-runs.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) VALUES (
  'pharmacy-assets',
  'pharmacy-assets',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/svg+xml']
) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SECTION 3 — RLS policies on storage.objects for pharmacy-assets bucket
-- storage.objects has RLS enabled by default in Supabase.
-- 4 policies: public SELECT + superadmin INSERT / UPDATE / DELETE.
-- DROP IF EXISTS guards make this block safe to re-run.
-- public.profiles explicit schema: avoids resolution issues when the policy
-- body is evaluated in the storage schema context.
-- is_active + is_deleted guards: consistent with get_user_role() behaviour.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "pharmacy_assets_public_select"     ON storage.objects;
DROP POLICY IF EXISTS "pharmacy_assets_superadmin_insert" ON storage.objects;
DROP POLICY IF EXISTS "pharmacy_assets_superadmin_update" ON storage.objects;
DROP POLICY IF EXISTS "pharmacy_assets_superadmin_delete" ON storage.objects;

CREATE POLICY "pharmacy_assets_public_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'pharmacy-assets');

CREATE POLICY "pharmacy_assets_superadmin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'pharmacy-assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id         = auth.uid()
        AND profiles.role       = 'superadmin'
        AND profiles.is_active  = true
        AND profiles.is_deleted = false
    )
  );

CREATE POLICY "pharmacy_assets_superadmin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'pharmacy-assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id         = auth.uid()
        AND profiles.role       = 'superadmin'
        AND profiles.is_active  = true
        AND profiles.is_deleted = false
    )
  )
  WITH CHECK (
    bucket_id = 'pharmacy-assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id         = auth.uid()
        AND profiles.role       = 'superadmin'
        AND profiles.is_active  = true
        AND profiles.is_deleted = false
    )
  );

CREATE POLICY "pharmacy_assets_superadmin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'pharmacy-assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id         = auth.uid()
        AND profiles.role       = 'superadmin'
        AND profiles.is_active  = true
        AND profiles.is_deleted = false
    )
  );
