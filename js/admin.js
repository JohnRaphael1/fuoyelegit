// js/admin.js — Full admin dashboard logic

import { supabase } from './supabase-client.js';
import { logout } from './auth.js';
import { escapeHtml, fmtDate, timeAgo, toast, uploadMedia, requireRole } from './main.js';

/* ============================================================
   CONFIG — your Edge Function URL
============================================================ */
const EDGE_FN_URL = 'https://yrpjumnzijdxysnqjbdc.supabase.co/functions/v1/create-user';

/* ============================================================
   GUARD — must be logged in as admin
============================================================ */
const me = await requireRole('admin');
if (!me) throw new Error('Not admin');

/* ============================================================
   DOM refs
============================================================ */
const titleEl    = document.getElementById('page-title');
const contentEl  = document.getElementById('section-content');
const navLinks   = document.querySelectorAll('#admin-nav a[data-section]');
const bellWrap   = document.getElementById('bell-wrap');
const notifPanel = document.getElementById('notif-panel');
const notifCount = document.getElementById('notif-count');

/* ============================================================
   Helpers
============================================================ */
async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) throw new Error('Session expired — please log in again');
  return session;
}

async function callEdgeFn(payload) {
  const session = await getSession();
  const res = await fetch(EDGE_FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

/* ============================================================
   ROUTER
============================================================ */
const sectionRenderers = {
  profile:           renderProfile,
  'create-user':     renderCreateUser,
  'view-users':      renderViewUsers,
  'create-news':     renderCreateNews,
  'manage-news':     renderManageNews,
  'create-community':renderCreateCommunity,
  'manage-community':renderManageCommunity,
  cbt:               renderCBT,
  contacts:          renderContacts,
};

navLinks.forEach(a => a.addEventListener('click', async e => {
  e.preventDefault();
  const sec = a.dataset.section;
  if (sec === 'logout') { await logout(); return; }
  navLinks.forEach(x => x.classList.remove('active'));
  a.classList.add('active');
  titleEl.textContent = a.textContent.trim().replace(/^[^\w]+\s*/, '');
  contentEl.innerHTML = `<div class="loading-block"><span class="spinner spinner-dark"></span> Loading…</div>`;
  try { await sectionRenderers[sec](); }
  catch (err) { contentEl.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`; }
}));

/* ============================================================
   PROFILE
============================================================ */
async function renderProfile() {
  const { data: p, error } = await supabase.from('profiles').select('*').eq('id', me.id).single();
  if (error) throw error;

  contentEl.innerHTML = `
    <div class="card">
      <div style="display:flex;gap:1rem;align-items:center;margin-bottom:1.5rem">
        <img src="${escapeHtml(p.profile_pic || 'logo/logo.jpg')}" alt="avatar"
             style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid var(--green)">
        <div>
          <h3 class="mb-0">${escapeHtml(p.username || 'Admin')}</h3>
          <span class="status-pill status-admin">${escapeHtml(p.role)}</span>
          <div class="text-muted" style="font-size:.85rem;margin-top:.2rem">${escapeHtml(me.email || '')}</div>
        </div>
      </div>
      <form id="profile-form">
        <div class="form-group">
          <label>Username</label>
          <input id="pf-username" value="${escapeHtml(p.username || '')}">
        </div>
        <div class="form-group">
          <label>Email (login)</label>
          <input value="${escapeHtml(me.email || '')}" disabled>
          <small>Email cannot be changed here.</small>
        </div>
        <div class="form-group">
          <label>Profile picture</label>
          <input type="file" id="pf-pic" accept="image/*">
        </div>
        <button class="btn-green" type="submit" id="pf-save">Save Profile</button>
      </form>
    </div>
  `;
  document.getElementById('profile-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('pf-save');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Saving…';
    try {
      let pic = p.profile_pic;
      const file = document.getElementById('pf-pic').files[0];
      if (file) pic = await uploadMedia(file);
      const username = document.getElementById('pf-username').value.trim();
      const { error } = await supabase.from('profiles')
        .update({ username, profile_pic: pic }).eq('id', me.id);
      if (error) throw error;
      toast('Profile updated');
      await renderProfile();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false; btn.textContent = 'Save Profile';
    }
  });
}

/* ============================================================
   CREATE USER
============================================================ */
async function renderCreateUser() {
  contentEl.innerHTML = `
    <div class="card">
      <h3 class="mb-2">Create a new user account</h3>
      <p class="text-muted mb-2" style="font-size:.88rem">
        This creates a Supabase Auth user with email + password.
      </p>
      <form id="cu-form">
        <div class="form-group">
          <label>Email</label>
          <input type="email" id="cu-email" required placeholder="student@example.com">
        </div>
        <div class="form-group">
          <label>Temporary password</label>
          <input type="text" id="cu-pass" required minlength="8" placeholder="at least 8 characters">
        </div>
        <button class="btn-green" type="submit" id="cu-btn">Create User</button>
      </form>
      <div id="cu-result" class="mt-2"></div>
    </div>
  `;
  document.getElementById('cu-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('cu-btn');
    const resultBox = document.getElementById('cu-result');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Creating…';
    const email = document.getElementById('cu-email').value.trim();
    const password = document.getElementById('cu-pass').value;
    try {
      const json = await callEdgeFn({ action: 'create', email, password });
      resultBox.innerHTML = `
        <div class="alert alert-success">
          ✅ User created: <strong>${escapeHtml(json.email)}</strong><br>
          Give them this password: <code>${escapeHtml(password)}</code>
        </div>`;
      document.getElementById('cu-form').reset();
    } catch (err) {
      resultBox.innerHTML = `<div class="alert alert-error">❌ ${escapeHtml(err.message)}</div>`;
    } finally {
      btn.disabled = false; btn.textContent = 'Create User';
    }
  });
}

/* ============================================================
   VIEW USERS
============================================================ */
async function renderViewUsers() {
  const { data: users, error } = await supabase
    .from('profiles').select('*').order('created_at', { ascending: false });
  if (error) throw error;

  contentEl.innerHTML = `
    <div class="card">
      <div class="flex-between mb-2">
        <h3 class="mb-0">All Users (${users.length})</h3>
        <input id="user-search" placeholder="Search username…"
               style="max-width:240px;padding:8px 12px;border:1.5px solid var(--border);border-radius:7px">
      </div>
      <div class="table-wrap">
        <table class="data-table" id="users-table">
          <thead><tr>
            <th>User</th><th>Role</th><th>Status</th><th>Posts</th><th>Joined</th><th>Actions</th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;

  const tbody = document.querySelector('#users-table tbody');

  function renderRows(list) {
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding:1.5rem">No users found.</td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(u => `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:.6rem">
            <img src="${escapeHtml(u.profile_pic || 'logo/logo.jpg')}"
                 style="width:34px;height:34px;border-radius:50%;object-fit:cover">
            <div>
              <div style="font-weight:600">${escapeHtml(u.username || '—')}</div>
              <small class="text-muted">${escapeHtml(u.id.slice(0,8))}…</small>
            </div>
          </div>
        </td>
        <td><span class="status-pill ${u.role==='admin'?'status-admin':'status-active'}">${u.role}</span></td>
        <td><span class="status-pill ${u.status==='active'?'status-active':'status-suspended'}">${u.status}</span></td>
        <td><span class="status-pill ${u.can_post?'status-active':'status-suspended'}">${u.can_post?'allowed':'blocked'}</span></td>
        <td><small class="text-muted">${fmtDate(u.created_at)}</small></td>
        <td style="white-space:nowrap">
          <button class="btn-ghost btn-sm" data-toggle-status="${u.id}" data-status="${u.status}">
            ${u.status === 'active' ? 'Suspend' : 'Activate'}
          </button>
          <button class="btn-ghost btn-sm" data-toggle-post="${u.id}" data-can="${u.can_post}">
            ${u.can_post ? 'Block Posts' : 'Allow Posts'}
          </button>
          <button class="btn-danger btn-sm" data-delete="${u.id}">Delete</button>
        </td>
      </tr>
    `).join('');
  }

  renderRows(users);

  document.getElementById('user-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    renderRows(users.filter(u => (u.username || '').toLowerCase().includes(q)));
  });

  tbody.addEventListener('click', async e => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.dataset.toggleStatus) {
      const id = btn.dataset.toggleStatus;
      const newStatus = btn.dataset.status === 'active' ? 'suspended' : 'active';
      btn.disabled = true;
      const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', id);
      if (error) { btn.disabled = false; return toast(error.message, 'error'); }
      toast(`User ${newStatus === 'active' ? 'activated' : 'suspended'}`);
      await renderViewUsers();
    }

    if (btn.dataset.togglePost) {
      const id = btn.dataset.togglePost;
      const newCan = btn.dataset.can === 'true' ? false : true;
      btn.disabled = true;
      const { error } = await supabase.from('profiles').update({ can_post: newCan }).eq('id', id);
      if (error) { btn.disabled = false; return toast(error.message, 'error'); }
      toast(newCan ? 'Posting allowed' : 'Posting blocked');
      await renderViewUsers();
    }

    if (btn.dataset.delete) {
      if (!confirm('Delete this user permanently? This removes their login too.')) return;
      const id = btn.dataset.delete;
      btn.disabled = true;
      try {
        await callEdgeFn({ action: 'delete', user_id: id });
        toast('User deleted');
        await renderViewUsers();
      } catch (err) {
        btn.disabled = false;
        toast(err.message, 'error');
      }
    }
  });
}

/* ============================================================
   CREATE NEWS
============================================================ */
async function renderCreateNews() {
  contentEl.innerHTML = `
    <div class="card">
      <h3 class="mb-2">Publish News</h3>
      <form id="news-form" enctype="multipart/form-data">
        <div class="form-group"><label>Title</label><input id="n-title" required></div>
        <div class="form-group"><label>Content</label><textarea id="n-content" required></textarea></div>
        <div class="form-group"><label>Media (image / video, optional)</label>
          <input type="file" id="n-file" accept="image/*,video/*"></div>
        <div class="form-group"><label>Visibility</label>
          <select id="n-vis">
            <option value="public">Public (everyone)</option>
            <option value="users_only">Users only</option>
          </select>
        </div>
        <button class="btn-green" id="n-btn" type="submit">Publish</button>
      </form>
    </div>
  `;
  document.getElementById('news-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('n-btn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Publishing…';
    try {
      const file = document.getElementById('n-file').files[0];
      const media_url = file ? await uploadMedia(file) : null;
      const { error } = await supabase.from('news').insert({
        title: document.getElementById('n-title').value.trim(),
        content: document.getElementById('n-content').value.trim(),
        media_url,
        visibility: document.getElementById('n-vis').value,
      });
      if (error) throw error;
      toast('News published');
      e.target.reset();
    } catch (err) { toast(err.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Publish'; }
  });
}

/* ============================================================
   MANAGE NEWS
============================================================ */
async function renderManageNews() {
  const { data, error } = await supabase.from('news').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  if (!data.length) { contentEl.innerHTML = `<div class="empty"><h3>No news yet</h3></div>`; return; }

  contentEl.innerHTML = data.map(n => `
    <div class="card">
      <h3>${escapeHtml(n.title)}</h3>
      <p>${escapeHtml(n.content).slice(0,300)}</p>
      ${n.media_url ? `<img src="${escapeHtml(n.media_url)}" loading="lazy">` : ''}
      <div class="card-meta"><span>${fmtDate(n.created_at)}</span><span>· ${n.visibility}</span></div>
      <div class="action-row">
        <button class="btn-danger btn-sm" data-del-news="${n.id}">Delete</button>
      </div>
    </div>
  `).join('');

  contentEl.querySelectorAll('[data-del-news]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this news post?')) return;
      await supabase.from('news').delete().eq('id', btn.dataset.delNews);
      toast('Deleted');
      await renderManageNews();
    });
  });
}

/* ============================================================
   CREATE COMMUNITY (admin)
============================================================ */
async function renderCreateCommunity() {
  contentEl.innerHTML = `
    <div class="card">
      <h3 class="mb-2">Post a Community Update (as Admin)</h3>
      <form id="cc-form" enctype="multipart/form-data">
        <div class="form-group"><label>Title</label><input id="cc-title" required></div>
        <div class="form-group"><label>Message</label><textarea id="cc-msg" required></textarea></div>
        <div class="form-group"><label>Media (optional)</label>
          <input type="file" id="cc-file" accept="image/*,video/*"></div>
        <button class="btn-green" id="cc-btn" type="submit">Post</button>
      </form>
    </div>
  `;
  document.getElementById('cc-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('cc-btn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Posting…';
    try {
      const file = document.getElementById('cc-file').files[0];
      const media_url = file ? await uploadMedia(file) : null;
      const { error } = await supabase.from('community').insert({
        user_id: me.id,
        title: document.getElementById('cc-title').value.trim(),
        message: document.getElementById('cc-msg').value.trim(),
        media_url,
      });
      if (error) throw error;
      toast('Posted');
      e.target.reset();
    } catch (err) { toast(err.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Post'; }
  });
}

/* ============================================================
   MANAGE COMMUNITY
============================================================ */
async function renderManageCommunity() {
  const { data, error } = await supabase
    .from('community').select('*, profiles(username, profile_pic)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!data.length) { contentEl.innerHTML = `<div class="empty"><h3>No community updates yet</h3></div>`; return; }

  contentEl.innerHTML = data.map(p => `
    <div class="card">
      <div class="card-meta">
        <strong>${escapeHtml(p.profiles?.username || 'Unknown')}</strong>
        <span>· ${timeAgo(p.created_at)}</span>
      </div>
      <h3 class="mt-1">${escapeHtml(p.title)}</h3>
      <p>${escapeHtml(p.message).slice(0, 400)}</p>
      ${p.media_url ? `<img src="${escapeHtml(p.media_url)}" loading="lazy">` : ''}
      <div class="action-row">
        <button class="btn-danger btn-sm" data-del-post="${p.id}">Delete</button>
      </div>
    </div>
  `).join('');

  contentEl.querySelectorAll('[data-del-post]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this community post?')) return;
      await supabase.from('community').delete().eq('id', btn.dataset.delPost);
      toast('Deleted');
      await renderManageCommunity();
    });
  });
}

/* ============================================================
   CBT MANAGER
============================================================ */
async function renderCBT() {
  const { data: levels }    = await supabase.from('cbt_levels').select('*').order('id');
  const { data: courses }   = await supabase.from('cbt_courses').select('*').order('id');
  const { data: questions } = await supabase.from('cbt_questions').select('*').order('id');

  contentEl.innerHTML = `
    <div class="grid-2">
      <div class="card">
        <h3>Levels</h3>
        <form id="lvl-form" class="mt-1">
          <div class="form-group"><input id="lvl-name" placeholder="e.g. 200 Level" required></div>
          <button class="btn-green btn-sm" type="submit">Add Level</button>
        </form>
        <ul class="mt-2" style="list-style:none">
          ${(levels || []).map(l => `
            <li class="flex-between mb-1" style="padding:.5rem 0;border-bottom:1px solid var(--border)">
              <span>${escapeHtml(l.level_name)}</span>
              <button class="btn-ghost btn-sm" data-del-lvl="${l.id}">Delete</button>
            </li>
          `).join('') || '<li class="text-muted">No levels yet</li>'}
        </ul>
      </div>
      <div class="card">
        <h3>Courses</h3>
        <form id="crs-form" class="mt-1">
          <div class="form-group">
            <label>Level</label>
            <select id="crs-lvl" required>
              <option value="">Select level</option>
              ${(levels || []).map(l => `<option value="${l.id}">${escapeHtml(l.level_name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Course name</label><input id="crs-name" placeholder="e.g. GST 101" required></div>
          <div class="form-group"><label>Time limit (minutes)</label><input id="crs-time" type="number" min="1" value="10" required></div>
          <button class="btn-green btn-sm" type="submit">Add Course</button>
        </form>
        <ul class="mt-2" style="list-style:none">
          ${(courses || []).map(c => `
            <li class="flex-between mb-1" style="padding:.5rem 0;border-bottom:1px solid var(--border)">
              <span>${escapeHtml(c.course_name)} <small class="text-muted">(${c.time_limit}min)</small></span>
              <button class="btn-ghost btn-sm" data-del-crs="${c.id}">Delete</button>
            </li>
          `).join('') || '<li class="text-muted">No courses yet</li>'}
        </ul>
      </div>
    </div>

    <div class="card mt-2">
      <h3>Add Question</h3>
      <form id="q-form" class="mt-1">
        <div class="form-group">
          <label>Course</label>
          <select id="q-crs" required>
            <option value="">Select course</option>
            ${(courses || []).map(c => `<option value="${c.id}">${escapeHtml(c.course_name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Question</label><textarea id="q-text" required></textarea></div>
        <div class="form-row">
          <div class="form-group"><label>Option A</label><input id="q-a" required></div>
          <div class="form-group"><label>Option B</label><input id="q-b" required></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Option C</label><input id="q-c" required></div>
          <div class="form-group"><label>Option D</label><input id="q-d" required></div>
        </div>
        <div class="form-group">
          <label>Correct Answer</label>
          <select id="q-correct" required>
            <option value="A">A</option><option value="B">B</option>
            <option value="C">C</option><option value="D">D</option>
          </select>
        </div>
        <button class="btn-green" type="submit">Add Question</button>
      </form>

      <h3 class="mt-2">Existing Questions (${(questions || []).length})</h3>
      <div class="table-wrap mt-1">
        <table class="data-table">
          <thead><tr><th>Course</th><th>Question</th><th>Answer</th><th></th></tr></thead>
          <tbody>
            ${(questions || []).map(q => {
              const course = (courses || []).find(c => c.id === q.course_id);
              return `<tr>
                <td>${escapeHtml(course?.course_name || q.course_id)}</td>
                <td>${escapeHtml(q.question).slice(0,80)}…</td>
                <td><strong>${q.correct_option}</strong></td>
                <td><button class="btn-danger btn-sm" data-del-q="${q.id}">Del</button></td>
              </tr>`;
            }).join('') || '<tr><td colspan="4" class="text-muted text-center">No questions yet</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('lvl-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('lvl-name').value.trim();
    if (!name) return;
    const { error } = await supabase.from('cbt_levels').insert({ level_name: name });
    if (error) return toast(error.message, 'error');
    toast('Level added'); await renderCBT();
  });
  document.getElementById('crs-form').addEventListener('submit', async e => {
    e.preventDefault();
    const level_id = document.getElementById('crs-lvl').value;
    const course_name = document.getElementById('crs-name').value.trim();
    const time_limit = parseInt(document.getElementById('crs-time').value);
    if (!level_id || !course_name) return;
    const { error } = await supabase.from('cbt_courses').insert({ level_id, course_name, time_limit });
    if (error) return toast(error.message, 'error');
    toast('Course added'); await renderCBT();
  });
  document.getElementById('q-form').addEventListener('submit', async e => {
    e.preventDefault();
    const course_id = document.getElementById('q-crs').value;
    if (!course_id) return;
    const { error } = await supabase.from('cbt_questions').insert({
      course_id: parseInt(course_id),
      question: document.getElementById('q-text').value.trim(),
      option_a: document.getElementById('q-a').value.trim(),
      option_b: document.getElementById('q-b').value.trim(),
      option_c: document.getElementById('q-c').value.trim(),
      option_d: document.getElementById('q-d').value.trim(),
      correct_option: document.getElementById('q-correct').value,
    });
    if (error) return toast(error.message, 'error');
    toast('Question added'); await renderCBT();
  });

  contentEl.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.dataset.delLvl) {
        if (!confirm('Delete level (and its courses)?')) return;
        await supabase.from('cbt_levels').delete().eq('id', btn.dataset.delLvl);
        toast('Deleted'); await renderCBT();
      }
      if (btn.dataset.delCrs) {
        if (!confirm('Delete course (and its questions)?')) return;
        await supabase.from('cbt_courses').delete().eq('id', btn.dataset.delCrs);
        toast('Deleted'); await renderCBT();
      }
      if (btn.dataset.delQ) {
        if (!confirm('Delete question?')) return;
        await supabase.from('cbt_questions').delete().eq('id', btn.dataset.delQ);
        toast('Deleted'); await renderCBT();
      }
    });
  });
}

/* ============================================================
   CONTACTS
============================================================ */
async function renderContacts() {
  const { data } = await supabase.from('contacts').select('*').order('id');
  contentEl.innerHTML = `
    <div class="card">
      <h3>Add Contact Number</h3>
      <form id="ct-form" class="mt-1">
        <div class="form-row">
          <div class="form-group">
            <label>Phone (with country code)</label>
            <input id="ct-phone" placeholder="+2348012345678" required>
          </div>
          <div class="form-group">
            <label>Visibility</label>
            <select id="ct-private">
              <option value="false">Public</option>
              <option value="true">Private</option>
            </select>
          </div>
        </div>
        <button class="btn-green btn-sm" type="submit">Add</button>
      </form>
      <h3 class="mt-2">Saved Contacts</h3>
      <ul class="mt-1" style="list-style:none">
        ${(data || []).map(c => `
          <li class="flex-between mb-1" style="padding:.6rem 0;border-bottom:1px solid var(--border)">
            <span>${escapeHtml(c.phone_number)}
              <span class="status-pill ${c.is_private ? 'status-suspended':'status-active'}">${c.is_private?'private':'public'}</span>
            </span>
            <div>
              <button class="btn-ghost btn-sm" data-toggle-ct="${c.id}" data-priv="${c.is_private}">
                ${c.is_private ? 'Make Public' : 'Make Private'}
              </button>
              <button class="btn-danger btn-sm" data-del-ct="${c.id}">Delete</button>
            </div>
          </li>
        `).join('') || '<li class="text-muted">No contacts yet</li>'}
      </ul>
    </div>
  `;
  document.getElementById('ct-form').addEventListener('submit', async e => {
    e.preventDefault();
    const phone = document.getElementById('ct-phone').value.trim();
    const is_private = document.getElementById('ct-private').value === 'true';
    const { error } = await supabase.from('contacts').insert({ phone_number: phone, is_private });
    if (error) return toast(error.message, 'error');
    toast('Contact added'); await renderContacts();
  });
  contentEl.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.dataset.toggleCt) {
        const id = btn.dataset.toggleCt;
        const next = btn.dataset.priv === 'true' ? false : true;
        await supabase.from('contacts').update({ is_private: next }).eq('id', id);
        toast('Updated'); await renderContacts();
      }
      if (btn.dataset.delCt) {
        if (!confirm('Delete this contact?')) return;
        await supabase.from('contacts').delete().eq('id', btn.dataset.delCt);
        toast('Deleted'); await renderContacts();
      }
    });
  });
}

/* ============================================================
   NOTIFICATIONS BELL
============================================================ */
async function refreshNotifications() {
  // Fetch only notifications the admin can see (RLS allows all)
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.warn('Notifications error:', error.message);
    notifCount.classList.add('hidden');
    notifPanel.innerHTML = `<div class="notif-item text-muted">Could not load notifications</div>`;
    return;
  }

  const unread = (data || []).filter(n => !n.is_read).length;
  if (unread > 0) {
    notifCount.textContent = unread > 9 ? '9+' : unread;
    notifCount.classList.remove('hidden');
  } else {
    notifCount.classList.add('hidden');
  }

  notifPanel.innerHTML = (data && data.length)
    ? data.map(n => `
        <div class="notif-item ${n.is_read ? '' : 'unread'}">
          ${escapeHtml(n.message)}
          <small>${timeAgo(n.created_at)}</small>
        </div>
      `).join('')
    : `<div class="notif-item text-muted">No notifications</div>`;
}

async function markAllNotificationsRead() {
  // Update only unread ones — RLS allows admin to update all notifications
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('is_read', false);
  if (error) console.warn('Could not mark notifications read:', error.message);
}

bellWrap.addEventListener('click', async e => {
  if (e.target.closest('.notif-panel')) return;
  const opening = !notifPanel.classList.contains('open');
  notifPanel.classList.toggle('open');
  if (opening) {
    await markAllNotificationsRead();
    setTimeout(refreshNotifications, 300);
  }
});

document.addEventListener('click', e => {
  if (!bellWrap.contains(e.target)) notifPanel.classList.remove('open');
});

/* ============================================================
   BOOT
============================================================ */
await renderProfile();
await refreshNotifications();
setInterval(refreshNotifications, 20000);