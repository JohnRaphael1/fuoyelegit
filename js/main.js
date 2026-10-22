import { supabase } from './supabase-client.js';
import { getCurrentUser, logout } from './auth.js';

// ─── HTML escaping (prevents XSS in every injected template) ───
export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

// ─── Date formatting ───
export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-NG', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export function timeAgo(iso) {
  if (!iso) return '';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return Math.floor(secs/60) + 'm ago';
  if (secs < 86400) return Math.floor(secs/3600) + 'h ago';
  if (secs < 604800) return Math.floor(secs/86400) + 'd ago';
  return fmtDate(iso);
}

// ─── Toast notifications (bottom-right) ───
export function toast(msg, type = 'success') {
  let box = document.getElementById('toast-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast-box';
    Object.assign(box.style, {
      position: 'fixed', bottom: '20px', right: '20px',
      zIndex: 9999, display: 'flex', flexDirection: 'column',
      gap: '8px', maxWidth: '340px'
    });
    document.body.appendChild(box);
  }
  const colors = {
    success: '#00A859', error: '#dc3545', info: '#2563eb', warn: '#f0a500'
  };
  const el = document.createElement('div');
  el.style.cssText = `
    background:${colors[type] || colors.success};color:#fff;
    padding:11px 16px;border-radius:8px;font-size:.88rem;
    box-shadow:0 6px 20px rgba(0,0,0,.2);font-weight:500;
    animation:slideIn .25s ease;
  `;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s';
    setTimeout(() => el.remove(), 320);
  }, 3200);
}

// inject toast animation keyframes once
if (typeof document !== 'undefined' && !document.getElementById('toast-kf')) {
  const s = document.createElement('style');
  s.id = 'toast-kf';
  s.textContent = '@keyframes slideIn{from{transform:translateX(30px);opacity:0}to{transform:translateX(0);opacity:1}}';
  document.head.appendChild(s);
}

// ─── Render the shared navbar (used by all pages) ───
export async function renderNavbar(activePage = '') {
  const nav = document.querySelector('.navbar');
  if (!nav) return;
  const user = await getCurrentUser();

  const userMenu = user
    ? `
      <li><a href="${user.profile?.role === 'admin' ? 'admin.html' : 'user.html'}">Dashboard</a></li>
      <li><a href="#" id="nav-logout">Logout</a></li>
    `
    : `<li><a href="login.html">Login</a></li>`;

  const links = [
    ['index.html','Home'],
    ['news.html','News'],
    ['community.html','Community'],
    ['cbt.html','CBT']
  ];

  nav.innerHTML = `
    <a class="nav-brand" href="index.html">
      <img src="logo/logo.jpg" alt="Logo">
      <span>Legit Fuoye</span>
    </a>
    <ul class="nav-links">
      ${links.map(([href,label]) =>
        `<li><a href="${href}" class="${activePage === href ? 'active' : ''}">${label}</a></li>`
      ).join('')}
      ${userMenu}
    </ul>
  `;

  const lo = document.getElementById('nav-logout');
  if (lo) lo.addEventListener('click', e => { e.preventDefault(); logout(); });
}

// ─── Require login & correct role, else redirect ───
export async function requireRole(role) {
  const u = await getCurrentUser();
  if (!u) { location.href = 'login.html'; return null; }
  if (role && u.profile?.role !== role) {
    location.href = u.profile?.role === 'admin' ? 'admin.html' : 'user.html';
    return null;
  }
  return u;
}

// ─── Upload a file to Supabase Storage (bucket: media) ───
// Returns a public URL or throws.
export async function uploadMedia(file) {
  if (!file) return null;
  if (file.size > 15 * 1024 * 1024) throw new Error('File too large (max 15MB)');
  const ext = file.name.split('.').pop().toLowerCase();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2,9)}.${ext}`;
  const { error } = await supabase.storage.from('media').upload(path, file, {
    cacheControl: '3600', upsert: false
  });
  if (error) throw error;
  const { data } = supabase.storage.from('media').getPublicUrl(path);
  return data.publicUrl;
}

// ─── Send a notification to the admin (or to a specific user) ───
export async function sendNotification(message, userId = null) {
  try {
    await supabase.from('notifications').insert({ user_id: userId, message });
  } catch (_) { /* non-fatal */ }
}