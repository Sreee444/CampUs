// Environment variables - these are inlined by babel-preset-expo at build time
// EXPO_PUBLIC_* prefixed variables are safe for client-side use

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const aiApiBaseUrl = process.env.EXPO_PUBLIC_AI_API_BASE_URL;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Missing Supabase configuration. Make sure EXPO_PUBLIC_SUPABASE_URL and ' +
    'EXPO_PUBLIC_SUPABASE_ANON_KEY are set in your .env file.'
  );
}

export const ENV = {
  supabaseUrl: supabaseUrl ?? '',
  supabaseAnonKey: supabaseAnonKey ?? '',
  aiApiBaseUrl: aiApiBaseUrl ?? '',
};
