import { supabase } from './supabase-client.js';
import { escapeHtml, timeAgo, toast, uploadMedia } from './main.js';

/* ---------- Who is logged in? ---------- */
const { data: { user } } = await supabase.auth.getUser();
let me = null;
if (user) {
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  me = { ...user, role: p?.role };
  const dash = p?.role === 'admin' ? 'admin.html' : 'user.html';
  document.getElementById('nav-auth').innerHTML =
    `<a href="${dash}" class="btn-green" style="padding:7px 16px">Dashboard</a>`;
}

/* ---------- Compose visibility ---------- */
if (me) {
  document.getElementById('compose-box').classList.remove('hidden');
} else {
  document.getElementById('compose-login').classList.remove('hidden');
}

/* ---------- Compose submit ---------- */
if (me) {
  document.getElementById('compose-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('c-btn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Posting…';
    try {
      const file = document.getElementById('c-file').files[0];
      const media_url = file ? await uploadMedia(file) : null;
      const { error } = await supabase.from('community').insert({
        user_id: me.id,
        title: document.getElementById('c-title').value.trim(),
        message: document.getElementById('c-msg').value.trim(),
        media_url,
      });
      if (error) throw error;
      toast('Posted');
      e.target.reset();
      await loadFeed();
    } catch (err) { toast(err.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Post'; }
  });
}

/* ---------- Feed loader ---------- */
async function loadFeed() {
  const box = document.getElementById('feed');
  box.innerHTML = `<div class="card loading-block"><span class="spinner spinner-dark"></span> Loading…</div>`;

  const { data, error } = await supabase
    .from('community')
    .select('*, profiles(username, profile_pic)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    box.innerHTML = `<div class="alert alert-error">${escapeHtml(error.message)}</div>`;
    return;
  }
  if (!data?.length) {
    box.innerHTML = `<div class="card"><div class="empty"><h3>No posts yet</h3><p>Be the first to share something!</p></div></div>`;
    return;
  }

  // Fetch likes + comments for visible posts
  const ids = data.map(p => p.id);
  const [{ data: likes }, { data: comments }] = await Promise.all([
    supabase.from('likes').select('post_id, user_id').in('post_id', ids),
    supabase.from('comments').select('*, profiles(username)').in('post_id', ids).order('created_at'),
  ]);

  box.innerHTML = data.map(p => {
    const postLikes = (likes || []).filter(l => l.post_id === p.id);
    const postComments = (comments || []).filter(c => c.post_id === p.id);
    const likedByMe = me && postLikes.some(l => l.user_id === me.id);
    const isOwner = me && me.id === p.user_id;
    const isAdmin = me && me.role === 'admin';
    const canDelete = isOwner || isAdmin;

    return `
      <article class="card" data-post-id="${p.id}">
        <div class="card-meta">
          <img src="${escapeHtml(p.profiles?.profile_pic || 'logo/logo.jpg')}"
               style="width:28px;height:28px;border-radius:50%;object-fit:cover">
          <strong>${escapeHtml(p.profiles?.username || 'Unknown')}</strong>
          <span>· ${timeAgo(p.created_at)}</span>
        </div>
        <h3 class="mt-1">${escapeHtml(p.title)}</h3>
        <p>${escapeHtml(p.message).replace(/\n/g, '<br>')}</p>
        ${p.media_url ? (p.media_url.match(/\.(mp4|webm|mov)$/i)
          ? `<video src="${escapeHtml(p.media_url)}" controls preload="metadata"></video>`
          : `<img src="${escapeHtml(p.media_url)}" alt="" loading="lazy">`) : ''}

        <div class="action-row">
          <button class="like-btn ${likedByMe ? 'liked' : ''}" data-like="${p.id}">
            ❤️ <span>${postLikes.length}</span>
          </button>
          <button class="btn-ghost btn-sm" data-comment-toggle="${p.id}">
            💬 ${postComments.length}
          </button>
          ${canDelete ? `<button class="btn-danger btn-sm" data-delete="${p.id}">Delete</button>` : ''}
        </div>

        <div class="comment-list ${postComments.length ? '' : 'hidden'}" data-comments-for="${p.id}">
          ${postComments.map(c => `
            <div class="comment">
              <strong>${escapeHtml(c.profiles?.username || 'Unknown')}</strong>:
              ${escapeHtml(c.comment)}
            </div>
          `).join('')}
        </div>

        ${me ? `
          <form class="comment-form mt-1 hidden" data-comment-form="${p.id}">
            <div style="display:flex;gap:.5rem">
              <input name="comment" placeholder="Write a comment…" required
                     style="flex:1;padding:8px 12px;border:1.5px solid var(--border);border-radius:7px">
              <button class="btn-green btn-sm" type="submit">Send</button>
            </div>
          </form>
        ` : ''}
      </article>
    `;
  }).join('');

  attachHandlers();
}

/* ---------- Handlers ---------- */
function attachHandlers() {
  const feed = document.getElementById('feed');

  feed.querySelectorAll('[data-like]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!me) { location.href = 'login.html'; return; }
      const post_id = parseInt(btn.dataset.like);
      const liked = btn.classList.contains('liked');
      try {
        if (liked) {
          await supabase.from('likes').delete().eq('post_id', post_id).eq('user_id', me.id);
        } else {
          await supabase.from('likes').insert({ post_id, user_id: me.id });
        }
        await loadFeed();
      } catch (e) { toast(e.message, 'error'); }
    });
  });

  feed.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this post?')) return;
      await supabase.from('community').delete().eq('id', btn.dataset.delete);
      toast('Deleted');
      await loadFeed();
    });
  });

  feed.querySelectorAll('[data-comment-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.commentToggle;
      feed.querySelector(`[data-comments-for="${id}"]`)?.classList.toggle('hidden');
      feed.querySelector(`[data-comment-form="${id}"]`)?.classList.toggle('hidden');
    });
  });

  feed.querySelectorAll('[data-comment-form]').forEach(form => {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const post_id = parseInt(form.dataset.commentForm);
      const comment = form.comment.value.trim();
      if (!comment) return;
      try {
        await supabase.from('comments').insert({ post_id, user_id: me.id, comment });
        await loadFeed();
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}

await loadFeed();