// Supabase project of this app. The publishable key is meant to be public: access to the data is
// limited by row level security (see supabase/schema.sql), not by keeping the key secret.
export const SUPABASE_URL = 'https://hzygpymdtqkzdovnhwye.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_lSwfpDXejFwKqnlZ2qKw6Q_gte0Jusy';
export const CLOUD_BUCKET = 'vtt-files';
export const DOCS_TABLE = 'vtt_docs';
export const USAGE_RPC = 'vtt_usage';

/** Limits of the Supabase free plan, for the usage meters. */
export const FREE_PLAN = { database: 500 * 1024 ** 2, files: 1024 ** 3 };
