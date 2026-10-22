import { supabase } from './supabase-client.js';

// Admin ID → Supabase Auth email
export const ADMIN_MAP = {
  'COLLINS_LEGIT001': 'dboard634@gmail.com'
};

export async function userLogin(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function adminLogin(adminId, password) {
  const email = ADMIN_MAP[adminId];
  if (!email) throw new Error('Unknown Admin ID');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  const { data: profile, error: pErr } = await supabase
    .from('profiles').select('role').eq('id', data.user.id).single();
  if (pErr || profile?.role !== 'admin') {
    await supabase.auth.signOut();
    throw new Error('This account is not an admin');
  }
  return data;
}

export async function logout() {
  await supabase.auth.signOut();
  window.location.href = 'index.html';
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single();
  return { ...user, profile };
}

// Guard a page — redirect if not logged in or wrong role
export async function guardPage(requiredRole = 'user') {
  const u = await getCurrentUser();
  if (!u) { window.location.href = 'login.html'; return null; }
  if (requiredRole === 'admin' && u.profile?.role !== 'admin') {
    window.location.href = 'user.html'; return null;
  }
  return u;
}