import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://yrpjumnzijdxysnqjbdc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlycGp1bW56aWpkeHlzbnFqYmRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NDkzMDgsImV4cCI6MjEwODIyNTMwOH0.nIpyvJrFg2f3BdxocKCQRWfA_e8KELK_VLwMANomqKI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);