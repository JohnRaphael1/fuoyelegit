import { supabase } from './supabase-client.js';
import { logout } from './auth.js';
import { escapeHtml, fmtDate, timeAgo, toast, renderNavbar, uploadMedia, requireRole } from './main.js';

const me = await requireRole('user');
if (!me) throw new Error('Not logged in');
await renderNavbar('');

const titleEl   = document.getElementById('page-title');
const contentEl = document.getElementById('section-content');
const navLinks  = document.querySelectorAll('#user-nav a[data-section]');

const sections = {
  profile: renderProfile,
  'my-posts': renderMyPosts,
  notifications: renderNotifications
};

navLinks.forEach(a => a.addEventListener('click', async e => {
  e.preventDefault();
  const sec = a.dataset.section;
  if (sec === 'logout') { await logout(); return; }
  navLinks.forEach(x => x.classList.remove('active'));
  a.classList.add('active');
  titleEl.textContent = a.textContent.trim();
  contentEl.innerHTML = `<div class="loading-block"><span class="spinner spinner-dark"></span> Loading…</div>`;
  try { await sections[sec](); }
  catch (err) { contentEl.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`; }
}));

/* ---------- PROFILE ---------- */
async function renderProfile() {
  const { data: p } = await supabase.from('profiles').select('*').eq('id', me.id).single();
  contentEl.innerHTML = `
    <div class="card">
      <div style="display:flex;gap:1rem;align-items:center;margin-bottom:1.2rem">
        <img src="${escapeHtml(p.profile_pic || 'logo/logo.jpg')}"
             style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid var(--green)">
        <div>
          <h3 class="mb-0">${escapeHtml(p.username || 'User')}</h3>
          <small class="text-muted">${escapeHtml(me.email)}</small>
        </div>
      </div>

      <form id="pf-form">
        <div class="form-group">
          <label>Username</label>
          <input id="pf-username" value="${escapeHtml(p.username || '')}">
        </div>
        <div class="form-group">
          <label>Email (login)</label>
          <input id="pf-email" type="email" value="${escapeHtml(me.email || '')}">
        </div>
        <div class="form-group">
          <label>New password (leave blank to keep current)</label>
          <input id="pf-pw" type="password" minlength="8" placeholder="at least 8 characters">
        </div>
        <div class="form-group">
          <label>Profile picture</label>
          <input id="pf-pic" type="file" accept="image/*">
        </div>
        <button class="btn-green" id="pf-btn" type="submit">Save Changes</button>
      </form>
    </div>
  `;

  document.getElementById('pf-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('pf-btn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Saving…';
    try {
      const username = document.getElementById('pf-username').value.trim();
      const newEmail = document.getElementById('pf-email').value.trim();
      const newPw    = document.getElementById('pf-pw').value;
      const file     = document.getElementById('pf-pic').files[0];

      let pic = p.profile_pic;
      if (file) pic = await uploadMedia(file);

      // 1. Profile row
      const { error: pErr } = await supabase.from('profiles')
        .update({ username, profile_pic: pic }).eq('id', me.id);
      if (pErr) throw pErr;

      // 2. Password
      if (newPw) {
        const { error: aErr } = await supabase.auth.updateUser({ password: newPw });
        if (aErr) throw aErr;
      }

      // 3. Email (requires re-auth, so send confirmation link)
      if (newEmail && newEmail !== me.email) {
        const { error: eErr } = await supabase.auth.updateUser({ email: newEmail });
        if (eErr) throw eErr;
        toast('Check your new email to confirm the change', 'info');
      }

      toast('Saved');
      await renderProfile();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Save Changes';
    }
  });
}

/* ---------- MY POSTS ---------- */
async function renderMyPosts() {
  const { data, error } = await supabase
    .from('community').select('*').eq('user_id', me.id)
    .order('created_at', { ascending: false });
  if (error) throw error;

  contentEl.innerHTML = `
    <div class="card">
      <h3 class="mb-2">Create a Community Update</h3>
      <form id="post-form">
        <div class="form-group"><label>Title</label><input id="p-title" required></div>
        <div class="form-group"><label>Message</label><textarea id="p-msg" required></textarea></div>
        <div class="form-group"><label>Media (optional)</label><input id="p-file" type="file" accept="image/*,video/*"></div>
        <button class="btn-green" id="p-btn" type="submit">Post</button>
      </form>
    </div>
    <h2 class="section-title mt-2">My Updates (${data.length})</h2>
    ${data.length ? data.map(p => `
      <div class="card">
        <h3>${escapeHtml(p.title)}</h3>
        <p>${escapeHtml(p.message)}</p>
        ${p.media_url ? `<img src="${escapeHtml(p.media_url)}" loading="lazy">` : ''}
        <div class="card-meta"><span>${timeAgo(p.created_at)}</span></div>
        <div class="action-row">
          <button class="btn-ghost btn-sm" data-edit="${p.id}">Edit</button>
          <button class="btn-danger btn-sm" data-del="${p.id}">Delete</button>
        </div>
      </div>
    `).join('') : `<div class="empty"><h3>You haven't posted yet</h3><p>Use the form above to share an update.</p></div>`}
  `;

  document.getElementById('post-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('p-btn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Posting…';
    try {
      const file = document.getElementById('p-file').files[0];
      const media_url = file ? await uploadMedia(file) : null;
      const { error } = await supabase.from('community').insert({
        user_id: me.id,
        title: document.getElementById('p-title').value.trim(),
        message: document.getElementById('p-msg').value.trim(),
        media_url
      });
      if (error) throw error;
      toast('Posted');
      await renderMyPosts();
    } catch (err) { toast(err.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Post'; }
  });

  contentEl.addEventListener('click', async e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.del) {
      if (!confirm('Delete this post?')) return;
      await supabase.from('community').delete().eq('id', t.dataset.del);
      toast('Deleted'); await renderMyPosts();
    }
    if (t.dataset.edit) {
      const id = t.dataset.edit;
      const { data: post } = await supabase.from('community').select('*').eq('id', id).single();
      contentEl.innerHTML = `
        <div class="card">
          <h3>Edit Post</h3>
          <form id="edit-form">
            <div class="form-group"><label>Title</label>
              <input id="e-title" value="${escapeHtml(post.title)}" required></div>
            <div class="form-group"><label>Message</label>
              <textarea id="e-msg" required>${escapeHtml(post.message)}</textarea></div>
            <div class="action-row">
              <button class="btn-green" type="submit">Save</button>
              <button type="button" class="btn-ghost" id="cancel-edit">Cancel</button>
            </div>
          </form>
        </div>
      `;
      document.getElementById('cancel-edit').addEventListener('click', renderMyPosts);
      document.getElementById('edit-form').addEventListener('submit', async ev => {
        ev.preventDefault();
        await supabase.from('community').update({
          title: document.getElementById('e-title').value.trim(),
          message: document.getElementById('e-msg').value.trim()
        }).eq('id', id);
        toast('Updated'); await renderMyPosts();
      });
    }
  });
}

/* ---------- NOTIFICATIONS ---------- */
async function renderNotifications() {
  const { data, error } = await supabase
    .from('notifications').select('*').eq('user_id', me.id)
    .order('created_at', { ascending: false }).limit(50);
  if (error) throw error;

  contentEl.innerHTML = `
    <div class="card">
      <h3 class="mb-2">Notifications</h3>
      ${data.length ? data.map(n => `
        <div class="notif-item ${n.is_read?'':'unread'}" style="border-bottom:1px solid var(--border);padding:.8rem 0">
          ${escapeHtml(n.message)}
          <small class="text-muted" style="display:block;margin-top:.2rem">${fmtDate(n.created_at)}</small>
        </div>
      `).join('') : '<div class="empty"><h3>No notifications</h3></div>'}
    </div>
  `;
  // mark all read
  await supabase.from('notifications').update({ is_read: true }).eq('user_id', me.id);
}

await renderProfile();