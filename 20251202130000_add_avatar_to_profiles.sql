-- Add avatar_url column to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- Create avatars bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
SELECT 'avatars', 'avatars', true
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'avatars');

-- Enable RLS policies for avatars bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow avatar read' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow avatar read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow avatar insert' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow avatar insert"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'avatars' AND auth.uid() = owner);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow avatar update' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow avatar update"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'avatars' AND auth.uid() = owner)
      WITH CHECK (bucket_id = 'avatars' AND auth.uid() = owner);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow avatar delete' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow avatar delete"
      ON storage.objects FOR DELETE
      USING (bucket_id = 'avatars' AND auth.uid() = owner);
  END IF;
END $$;
