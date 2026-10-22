import { supabase } from './supabase-client.js';
import { escapeHtml, toast } from './main.js';

const app = document.getElementById('cbt-app');

const { data: { user } } = await supabase.auth.getUser();
let me = null;
if (user) {
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  me = { ...user, role: p?.role };
  const dash = p?.role === 'admin' ? 'admin.html' : 'user.html';
  document.getElementById('nav-auth').innerHTML =
    `<a href="${dash}" class="btn-green" style="padding:7px 16px">Dashboard</a>`;
}

/* ---------- STATE ---------- */
let levels = [], courses = [], currentCourse = null, currentQuestions = [];
let answers = {}, timeLeft = 0, timerId = null, startTime = 0;

/* ---------- HELPERS ---------- */
function shuffle(a) { return a.sort(() => Math.random() - 0.5); }

/* ============================================================
   SCREEN 1 — Choose level + course
============================================================ */
async function screenPicker() {
  if (!me) {
    app.innerHTML = `
      <div class="card text-center">
        <h3>Login required</h3>
        <p>You need an account to take CBT practice tests.</p>
        <a href="login.html" class="btn-green mt-1">Log in</a>
        <p class="text-muted mt-2" style="font-size:.88rem">Contact admin if you don't have an account.</p>
      </div>`;
    return;
  }

  const [{ data: lv }, { data: cr }] = await Promise.all([
    supabase.from('cbt_levels').select('*').order('id'),
    supabase.from('cbt_courses').select('*').order('id'),
  ]);
  levels = lv || []; courses = cr || [];

  if (!levels.length) {
    app.innerHTML = `<div class="card"><div class="empty"><h3>No CBT levels yet</h3><p>Check back later.</p></div></div>`;
    return;
  }

  app.innerHTML = `
    <div class="card">
      <h3 class="mb-2">Choose a Level</h3>
      <div class="grid-3">
        ${levels.map(l => `
          <button class="btn-outline" data-level="${l.id}">${escapeHtml(l.level_name)}</button>
        `).join('')}
      </div>
    </div>
    <div id="course-picker" class="mt-2"></div>
  `;

  app.querySelectorAll('[data-level]').forEach(btn => {
    btn.addEventListener('click', () => {
      app.querySelectorAll('[data-level]').forEach(b => b.classList.remove('btn-green'));
      btn.classList.add('btn-green');
      const lvlId = parseInt(btn.dataset.level);
      const filtered = courses.filter(c => c.level_id === lvlId);

      const picker = document.getElementById('course-picker');
      if (!filtered.length) {
        picker.innerHTML = `<div class="card"><p class="text-muted">No courses in this level yet.</p></div>`;
        return;
      }
      picker.innerHTML = `
        <div class="card">
          <h3 class="mb-2">Choose a Course</h3>
          <div class="grid-2">
            ${filtered.map(c => `
              <button class="btn-outline" data-course="${c.id}">
                ${escapeHtml(c.course_name)} <small>(${c.time_limit} min)</small>
              </button>
            `).join('')}
          </div>
        </div>
      `;
      picker.querySelectorAll('[data-course]').forEach(cb => {
        cb.addEventListener('click', () => startExam(parseInt(cb.dataset.course)));
      });
    });
  });
}

/* ============================================================
   SCREEN 2 — Exam
============================================================ */
async function startExam(courseId) {
  const course = courses.find(c => c.id === courseId);
  if (!course) return;
  currentCourse = course;

  const { data: qs, error } = await supabase
    .from('cbt_questions').select('*').eq('course_id', courseId);
  if (error) { toast(error.message, 'error'); return; }
  if (!qs?.length) {
    app.innerHTML = `<div class="card"><div class="empty"><h3>No questions for this course</h3>
      <button class="btn-ghost mt-1" onclick="location.reload()">Back</button></div></div>`;
    return;
  }

  currentQuestions = shuffle([...qs]);
  answers = {};
  timeLeft = course.time_limit * 60;
  startTime = Date.now();

  renderExam();
  startTimer();
}

function renderExam() {
  app.innerHTML = `
    <div class="cbt-timer" id="timer-bar">
      <span>⏱ Time: <span id="timer-text">--:--</span></span>
      <span>${escapeHtml(currentCourse.course_name)} · ${currentQuestions.length} questions</span>
    </div>

    <div id="question-list">
      ${currentQuestions.map((q, i) => `
        <div class="cbt-question">
          <h4>${i+1}. ${escapeHtml(q.question)}</h4>
          ${['a','b','c','d'].map(letter => `
            <label class="cbt-option">
              <input type="radio" name="q${q.id}" value="${letter.toUpperCase()}" data-qid="${q.id}">
              <span><strong>${letter.toUpperCase()}.</strong> ${escapeHtml(q['option_'+letter])}</span>
            </label>
          `).join('')}
        </div>
      `).join('')}
    </div>

    <button class="btn-green btn-block mt-2" id="submit-exam">Submit Exam</button>
    <button class="btn-ghost btn-block mt-1" id="quit-exam">Quit</button>
  `;

  document.querySelectorAll('input[type=radio]').forEach(r => {
    r.addEventListener('change', e => {
      answers[e.target.dataset.qid] = e.target.value;
    });
  });

  document.getElementById('submit-exam').addEventListener('click', () => {
    if (Object.keys(answers).length < currentQuestions.length) {
      if (!confirm('You have unanswered questions. Submit anyway?')) return;
    }
    finishExam();
  });

  document.getElementById('quit-exam').addEventListener('click', () => {
    if (!confirm('Quit the exam? Your progress will be lost.')) return;
    clearInterval(timerId);
    screenPicker();
  });

  updateTimerText();
}

function startTimer() {
  clearInterval(timerId);
  timerId = setInterval(() => {
    timeLeft--;
    updateTimerText();
    if (timeLeft <= 0) {
      clearInterval(timerId);
      finishExam();
    }
  }, 1000);
}

function updateTimerText() {
  const m = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const s = String(timeLeft % 60).padStart(2, '0');
  const t = document.getElementById('timer-text');
  if (t) t.textContent = `${m}:${s}`;
  const bar = document.getElementById('timer-bar');
  if (bar) bar.classList.toggle('warn', timeLeft < 60);
}

/* ============================================================
   SCREEN 3 — Result
============================================================ */
async function finishExam() {
  clearInterval(timerId);

  let score = 0;
  currentQuestions.forEach(q => {
    const ans = answers[q.id];
    if (ans && ans === q.correct_option) score++;
  });
  const total = currentQuestions.length;
  const pct = Math.round((score / total) * 100);
  const grade = pct >= 70 ? 'A' : pct >= 60 ? 'B' : pct >= 50 ? 'C' : pct >= 40 ? 'D' : 'F';
  const passed = pct >= 50;

  // Save result
  try {
    await supabase.from('cbt_results').insert({
      user_id: me.id, course_id: currentCourse.id, score, total_questions: total,
    });
  } catch (_) {}

  app.innerHTML = `
    <div class="result-box">
      <h2>${passed ? '🎉 Well done!' : '😔 Try again'}</h2>
      <div class="result-score">${score} / ${total}</div>
      <p class="text-muted">${pct}% · Grade: <strong>${grade}</strong></p>
      <p class="text-muted mb-2">Course: ${escapeHtml(currentCourse.course_name)}</p>

      <div class="action-row" style="justify-content:center">
        <button class="btn-green" id="redo">🔄 Redo</button>
        <button class="btn-ghost" id="quit">🚪 Quit</button>
      </div>
    </div>
  `;

  document.getElementById('redo').addEventListener('click', () => {
    answers = {};
    startExam(currentCourse.id);
  });
  document.getElementById('quit').addEventListener('click', () => {
    screenPicker();
  });
}

/* ---------- BOOT ---------- */
await screenPicker();