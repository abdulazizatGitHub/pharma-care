-- Phase 12 / FIX 2: Add session_timeout_minutes to settings
-- 0 = disabled, default 30 minutes

INSERT INTO settings (key, value, label)
VALUES (
  'session_timeout_minutes',
  '30',
  'Auto-logout after this many minutes of inactivity. Set to 0 to disable.'
)
ON CONFLICT (key) DO NOTHING;
