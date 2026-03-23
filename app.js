const SUPABASE_URL = 'https://eowiyblzqfiyoalzsmbr.supabase.co';  // ← REPLACE THIS
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvd2l5Ymx6cWZpeW9hbHpzbWJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNTEyMjIsImV4cCI6MjA4OTgyNzIyMn0.WBJLVBSOMzRkfEdn2aXYsH3PcRiTvSLkoE9E_7zl-5k';                   // ← REPLACE THIS

// ─── STATE ───
let db;
let currentUser = null;
let state = { subjects: [], syllabus: [], todos: [], sessions: [] };

// ─── BOOT ───
db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

window.addEventListener('DOMContentLoaded', () => {
  if (!SUPABASE_URL || SUPABASE_URL.includes('YOUR_PROJECT') ||
    !SUPABASE_KEY || SUPABASE_KEY.includes('YOUR_ANON')) {
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0d0f14;font-family:monospace;padding:24px">
        <div style="background:#181c26;border:2px solid #ff6b6b;border-radius:12px;padding:32px;max-width:560px;width:100%">
          <div style="color:#ff6b6b;font-size:20px;font-weight:700;margin-bottom:16px">⚠️ Credentials Missing</div>
          <div style="color:#9ca3af;font-size:14px;line-height:1.8">
            Open <code style="color:#c8f562">app.js</code> and replace the two placeholder values at the top:<br><br>
            <code style="color:#c8f562;background:#0d0f14;padding:10px 14px;border-radius:6px;display:block;margin:8px 0">
              const SUPABASE_URL = 'https://xxxx.supabase.co';<br>
              const SUPABASE_KEY = 'eyJhbGci...';
            </code><br>
            Find these in:<br>
            <strong style="color:#e8eaf0">Supabase Dashboard → Your Project → Settings → API</strong>
          </div>
        </div>
      </div>`;
    return;
  }

  setupNavigation();
  setupPasswordStrength();

  db.auth.onAuthStateChange(async (event, session) => {
    dbg('Auth event: ' + event + ' | ' + (session?.user?.email || 'no user'));
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
      if (currentUser?.id === session.user.id &&
        document.getElementById('appScreen').style.display === 'flex') {
        dbg('Already in app, skipping');
        return;
      }
      currentUser = session.user;
      setAuthLoading('login', false);
      setAuthLoading('signup', false);
      await showApp();
    } else if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !session?.user)) {
      currentUser = null;
      state = { subjects: [], syllabus: [], todos: [], sessions: [] };
      showAuth();
    }
  });
});


// ─── DEBUG ───
function dbg(msg) {
  console.log('[ExamTracker] ' + msg);
  const el = document.getElementById('debugLog');
  if (el) {
    const line = document.createElement('div');
    line.textContent = new Date().toLocaleTimeString() + ' — ' + msg;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
  }
}

// ─── AUTH UI ───
function showAuth() {
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('appScreen').style.display = 'none';
  clearAuthError();
}

async function showApp() {
  dbg('showApp() called');
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = 'flex';
  updateUserDisplay();
  dbg('Switched to app screen, loading data...');
  try {
    await loadAllData();
    dbg('Data loaded OK');
  } catch (e) {
    console.error(e);
    dbg('ERROR: ' + e.message);
    toast('Error loading data: ' + e.message, true);
  }
}

function switchAuthTab(tab) {
  document.getElementById('loginTab').classList.toggle('active', tab === 'login');
  document.getElementById('signupTab').classList.toggle('active', tab === 'signup');
  document.getElementById('loginForm').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('signupForm').style.display = tab === 'signup' ? 'block' : 'none';
  clearAuthError();
}

function setAuthLoading(formId, loading) {
  const btn = document.getElementById(formId === 'login' ? 'loginBtn' : 'signupBtn');
  if (!btn) return;
  const text = btn.querySelector('.btn-text');
  const loader = btn.querySelector('.btn-loader');
  btn.disabled = loading;
  text.style.display = loading ? 'none' : 'inline';
  loader.style.display = loading ? 'inline' : 'none';
}

function showAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = '⚠️ ' + msg;
  el.style.display = 'block';
}

function clearAuthError() {
  const el = document.getElementById('authError');
  el.style.display = 'none';
  el.textContent = '';
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) { showAuthError('Please fill in all fields.'); return; }

  setAuthLoading('login', true);
  clearAuthError();
  dbg('Attempting login for: ' + email);

  try {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      dbg('Login error: ' + error.message);
      showAuthError(friendlyAuthError(error.message));
      setAuthLoading('login', false);
    }
  } catch (e) {
    dbg('Login exception: ' + e.message);
    showAuthError('Unexpected error. Please try again.');
    setAuthLoading('login', false);
  }
}

async function handleSignup() {
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const confirm = document.getElementById('signupConfirm').value;

  if (!name || !email || !password || !confirm) { showAuthError('Please fill in all fields.'); return; }
  if (password.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }
  if (password !== confirm) { showAuthError('Passwords do not match.'); return; }

  setAuthLoading('signup', true);
  clearAuthError();
  dbg('Attempting signup for: ' + email);

  try {
    const { data, error } = await db.auth.signUp({
      email, password,
      options: { data: { full_name: name } }
    });

    if (error) {
      dbg('Signup error: ' + error.message);
      showAuthError(friendlyAuthError(error.message));
      setAuthLoading('signup', false);
      return;
    }

    dbg('Signup success, session: ' + (data.session ? 'yes' : 'no (email confirm needed)'));

    if (!data.session) {
      // Email confirmation required
      setAuthLoading('signup', false);
      document.getElementById('signupForm').innerHTML = `
        <div style="text-align:center;padding:20px 0">
          <div style="font-size:40px;margin-bottom:12px">📧</div>
          <div style="font-size:16px;font-weight:600;color:var(--accent);margin-bottom:8px">Check your email!</div>
          <div style="font-size:13px;color:var(--text-muted)">We sent a confirmation link to
            <strong style="color:var(--text)">${email}</strong>.<br>Click the link to activate your account.
          </div>
        </div>`;
    }
  } catch (e) {
    dbg('Signup exception: ' + e.message);
    showAuthError('Unexpected error. Please try again.');
    setAuthLoading('signup', false);
  }
}

async function forgotPassword() {
  const email = document.getElementById('loginEmail').value.trim();
  if (!email) { showAuthError('Enter your email above first.'); return; }
  const { error } = await db.auth.resetPasswordForEmail(email);
  if (error) showAuthError(error.message);
  else { toast('Password reset email sent ✓'); clearAuthError(); }
}

async function handleLogout() {
  if (!confirm('Sign out of ExamTracker?')) return;
  try {
    const { error } = await db.auth.signOut();
    if (error) throw error;
    toast('Signed out successfully');
  } catch (e) {
    console.error('Logout error:', e);
    // Force UI reset even if signOut fails
    currentUser = null;
    state = { subjects: [], syllabus: [], todos: [], sessions: [] };
    showAuth();
    toast('Signed out');
  }
}

function friendlyAuthError(msg) {
  if (msg.includes('Invalid login')) return 'Invalid email or password.';
  if (msg.includes('Email not confirmed')) return 'Please confirm your email first.';
  if (msg.includes('already registered')) return 'This email is already registered. Try signing in.';
  if (msg.includes('rate limit')) return 'Too many attempts. Please wait a moment.';
  return msg;
}

function togglePass(inputId, btn) {
  const input = document.getElementById(inputId);
  input.type = input.type === 'password' ? 'text' : 'password';
  btn.textContent = input.type === 'password' ? '👁' : '🙈';
}

function setupPasswordStrength() {
  const pw = document.getElementById('signupPassword');
  if (!pw) return;
  pw.addEventListener('input', () => {
    const val = pw.value;
    const el = document.getElementById('pwStrength');
    if (!val) { el.innerHTML = ''; return; }
    let score = 0;
    if (val.length >= 6) score++;
    if (val.length >= 10) score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;
    const colors = ['#ff6b6b', '#ff6b6b', '#FFE66D', '#4ECDC4', '#c8f562'];
    el.innerHTML = `<div class="bar" style="width:${score * 20}%;background:${colors[score - 1] || '#555'}"></div>`;
  });
}

function updateUserDisplay() {
  if (!currentUser) return;
  const name = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
  const email = currentUser.email;
  document.getElementById('userAvatar').textContent = name.charAt(0).toUpperCase();
  document.getElementById('userName').textContent = name;
  document.getElementById('userEmail').textContent = email;
}

// ─── DATA LAYER ───
async function loadAllData() {
  dbg('loadAllData() — user: ' + currentUser?.id);
  const [s, sy, t, se] = await Promise.all([
    db.from('subjects').select('*').order('created_at'),
    db.from('syllabus').select('*').order('created_at'),
    db.from('todos').select('*').order('created_at'),
    db.from('sessions').select('*').order('started_at', { ascending: false }),
  ]);
  if (s.error) { dbg('subjects error: ' + s.error.message); throw s.error; }
  if (sy.error) { dbg('syllabus error: ' + sy.error.message); throw sy.error; }
  if (t.error) { dbg('todos error: ' + t.error.message); throw t.error; }
  if (se.error) { dbg('sessions error: ' + se.error.message); throw se.error; }
  state.subjects = s.data || [];
  state.syllabus = sy.data || [];
  state.todos = t.data || [];
  state.sessions = se.data || [];
  dbg(`Loaded: ${state.subjects.length} subjects, ${state.syllabus.length} topics, ${state.todos.length} todos, ${state.sessions.length} sessions`);
  renderAll();
}

async function dbInsert(table, obj) {
  const { data, error } = await db.from(table).insert(obj).select().single();
  if (error) throw error;
  state[table].push(data);
  return data;
}

async function dbUpdate(table, id, updates) {
  const { error } = await db.from(table).update(updates).eq('id', id);
  if (error) throw error;
  const i = state[table].findIndex(x => x.id === id);
  if (i !== -1) state[table][i] = { ...state[table][i], ...updates };
}

async function dbDelete(table, id) {
  const { error } = await db.from(table).delete().eq('id', id);
  if (error) throw error;
  state[table] = state[table].filter(x => x.id !== id);
}

// ─── RENDER ALL ───
function renderAll() {
  populateSubjectDropdowns();
  renderSubjects();
  renderSyllabus();
  renderTodos();
  renderProgress();
  renderTimer();
  renderTodaysSessions();
  renderHistory();
}

// ─── NAVIGATION ───
function setupNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'progress') setTimeout(renderProgress, 100);
      if (btn.dataset.tab === 'history') renderHistory();
    });
  });
}

// ─── SUBJECTS ───
async function addSubject() {
  const name = document.getElementById('subjectName').value.trim();
  const code = document.getElementById('subjectCode').value.trim();
  const exam = document.getElementById('subjectExamDate').value;
  const color = document.getElementById('subjectColor').value;
  if (!name) { toast('Enter a subject name', true); return; }
  try {
    await dbInsert('subjects', { name, code: code || null, exam_date: exam || null, color, user_id: currentUser.id });
    document.getElementById('subjectName').value = '';
    document.getElementById('subjectCode').value = '';
    document.getElementById('subjectExamDate').value = '';
    renderSubjects(); populateSubjectDropdowns();
    toast('Subject added ✓');
  } catch (e) { toast('Error: ' + e.message, true); }
}

// ─── SUBJECTS ───
function renderSubjects() {
  const el = document.getElementById('subjectsList');
  if (!state.subjects.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📚</div><p>No subjects yet. Add your first subject above!</p></div>';
    return;
  }
  el.innerHTML = state.subjects.map(s => {
    const topics = state.syllabus.filter(t => t.subject_id === s.id);
    const done = topics.filter(t => t.status === 'completed').length;
    const pct = topics.length ? Math.round(done / topics.length * 100) : 0;
    const daysLeft = s.exam_date ? Math.ceil((new Date(s.exam_date) - new Date()) / 86400000) : null;
    const dLabel = daysLeft !== null
      ? (daysLeft > 0 ? `<span>${daysLeft}d left</span>` : '<span style="color:#ff6b6b">Exam passed</span>')
      : 'No date set';
    return `
    <div class="subject-card" style="--subject-color:${s.color}">
      <div class="subject-name">${esc(s.name)}</div>
      <div class="subject-code">${esc(s.code || '—')}</div>
      <div class="subject-exam-date">📅 Exam: ${dLabel}</div>
      <div class="subject-progress-bar"><div class="subject-progress-fill" style="width:${pct}%"></div></div>
      <div class="subject-progress-label">${done}/${topics.length} topics done (${pct}%)</div>
      <div class="subject-actions">
        <button class="btn-icon" onclick="deleteSubject('${s.id}')">🗑 Delete</button>
      </div>
    </div>`;
  }).join('');
}

async function deleteSubject(id) {
  if (!confirm('Delete this subject and all related data?')) return;
  await dbDelete('subjects', id);
  state.syllabus = state.syllabus.filter(t => t.subject_id !== id);
  state.todos = state.todos.filter(t => t.subject_id !== id);
  renderAll(); toast('Subject deleted');
}

function populateSubjectDropdowns() {
  const opts = state.subjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  const allOpts = `<option value="all">All Subjects</option>` + opts;
  document.getElementById('syllabusSubject').innerHTML = `<option value="">Select Subject</option>` + opts;
  document.getElementById('syllabusFilter').innerHTML = allOpts;
  document.getElementById('todoSubject').innerHTML = `<option value="">No Subject</option>` + opts;
  document.getElementById('timerSubject').innerHTML = `<option value="">Select a subject to study</option>` + opts;
  document.getElementById('historySubjectFilter').innerHTML = allOpts;
}

// ─── SYLLABUS ───
async function addSyllabus() {
  const subjectId = document.getElementById('syllabusSubject').value;
  const unit = document.getElementById('syllabusUnit').value.trim();
  const topic = document.getElementById('syllabusTopic').value.trim();
  const status = document.getElementById('syllabusStatus').value;
  if (!subjectId) { toast('Select a subject', true); return; }
  if (!topic) { toast('Enter a topic name', true); return; }
  try {
    await dbInsert('syllabus', { subject_id: subjectId, unit: unit || 'General', topic, status, user_id: currentUser.id });
    document.getElementById('syllabusUnit').value = '';
    document.getElementById('syllabusTopic').value = '';
    renderSyllabus(); renderSubjects(); toast('Topic added ✓');
  } catch (e) { toast('Error: ' + e.message, true); }
}

// ─── SYLLABUS ───
function renderSyllabus() {
  const filterVal = document.getElementById('syllabusFilter')?.value || 'all';
  const el = document.getElementById('syllabusList');
  let topics = state.syllabus;
  if (filterVal !== 'all') topics = topics.filter(t => t.subject_id === filterVal);
  if (!topics.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>No syllabus topics yet.</p></div>'; return; }
  const grouped = {};
  topics.forEach(t => {
    const sub = state.subjects.find(s => s.id === t.subject_id);
    const key = (sub?.name || 'Unknown') + '||' + (t.unit || 'General');
    if (!grouped[key]) grouped[key] = { subName: sub?.name || 'Unknown', unit: t.unit || 'General', color: sub?.color || '#c8f562', items: [] };
    grouped[key].items.push(t);
  });
  el.innerHTML = Object.values(grouped).map(g => `
    <div class="syllabus-group">
      <div class="syllabus-group-header" style="border-left:3px solid ${g.color}">
        <span style="color:${g.color}">●</span>
        <span>${esc(g.subName)}</span>
        <span style="color:var(--text-muted);font-weight:400">/ ${esc(g.unit)}</span>
        <span style="margin-left:auto;font-size:12px;color:var(--text-muted)">${g.items.filter(i => i.status === 'completed').length}/${g.items.length}</span>
      </div>
      ${g.items.map(item => `
        <div class="syllabus-item">
          <div style="flex:1"><div class="syllabus-topic">${esc(item.topic)}</div></div>
          <span class="status-badge ${item.status}" onclick="cycleSyllabusStatus('${item.id}','${item.status}')">${statusLabel(item.status)}</span>
          <button class="btn-icon" onclick="deleteSyllabus('${item.id}')">🗑</button>
        </div>`).join('')}
    </div>`).join('');
}

function statusLabel(s) { return s === 'completed' ? '✅ Done' : s === 'in-progress' ? '🔄 In Progress' : '⏳ Pending'; }

async function cycleSyllabusStatus(id, current) {
  const next = { pending: 'in-progress', 'in-progress': 'completed', completed: 'pending' };
  await dbUpdate('syllabus', id, { status: next[current] });
  renderSyllabus(); renderSubjects();
}

async function deleteSyllabus(id) { await dbDelete('syllabus', id); renderSyllabus(); renderSubjects(); }

// ─── TODOS ───
let todoFilter = 'all';

async function addTodo() {
  const task = document.getElementById('todoTask').value.trim();
  const subjectId = document.getElementById('todoSubject').value;
  const due = document.getElementById('todoDue').value;
  const priority = document.getElementById('todoPriority').value;
  if (!task) { toast('Enter a task', true); return; }
  try {
    await dbInsert('todos', { task, subject_id: subjectId || null, due_date: due || null, priority, completed: false, user_id: currentUser.id });
    document.getElementById('todoTask').value = '';
    document.getElementById('todoDue').value = '';
    renderTodos(); toast('Task added ✓');
  } catch (e) { toast('Error: ' + e.message, true); }
}

function filterTodos(btn, f) {
  document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active'); todoFilter = f; renderTodos();
}

// ─── TODOS ───
function renderTodos() {
  const el = document.getElementById('todoList');
  let todos = [...state.todos];
  if (todoFilter === 'pending') todos = todos.filter(t => !t.completed);
  if (todoFilter === 'completed') todos = todos.filter(t => t.completed);
  if (todoFilter === 'high') todos = todos.filter(t => t.priority === 'high');
  if (!todos.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>No tasks here!</p></div>'; return; }
  const pri = { high: 0, medium: 1, low: 2 };
  todos.sort((a, b) => (a.completed - b.completed) || (pri[a.priority] - pri[b.priority]));
  el.innerHTML = todos.map(t => {
    const sub = state.subjects.find(s => s.id === t.subject_id);
    return `
    <div class="todo-item ${t.completed ? 'completed' : ''}">
      <div class="priority-dot ${t.priority}"></div>
      <div class="todo-checkbox ${t.completed ? 'checked' : ''}" onclick="toggleTodo('${t.id}',${t.completed})">${t.completed ? '✓' : ''}</div>
      <div style="flex:1">
        <div class="todo-text">${esc(t.task)}</div>
        ${t.due_date ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">Due: ${fmtDate(t.due_date)}</div>` : ''}
      </div>
      ${sub ? `<span class="todo-subject-tag" style="border-color:${sub.color};color:${sub.color}">${esc(sub.name)}</span>` : ''}
      <button class="btn-icon" onclick="deleteTodo('${t.id}')">🗑</button>
    </div>`;
  }).join('');
}

async function toggleTodo(id, current) { await dbUpdate('todos', id, { completed: !current }); renderTodos(); }
async function deleteTodo(id) { await dbDelete('todos', id); renderTodos(); }

// ─── TIMER ───
let timerInterval = null, timerSeconds = 0, timerRunning = false, timerPaused = false;
let timerMode = 'stopwatch', timerTarget = 0, pomodoroPhase = 'work', pomodoroCount = 0, sessionStart = null;

function setTimerMode(mode, btn) { document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); timerMode = mode; resetTimerDisplay(); document.getElementById('customTimeInput').style.display = mode === 'custom' ? 'block' : 'none'; }
function resetTimerDisplay() { timerSeconds = 0; document.getElementById('timerDisplay').textContent = '00:00:00'; document.getElementById('timerDisplay').className = 'timer-display'; document.getElementById('timerLabel').textContent = 'Ready to study'; document.getElementById('pomodoroStatus').innerHTML = ''; }
function renderTimer() { }

// ─── TIMER ───
function startTimer() {
  if (timerRunning) return;
  if (timerMode === 'pomodoro') { timerTarget = 25 * 60; pomodoroPhase = 'work'; timerSeconds = timerTarget; renderPomodoroDots(); }
  else if (timerMode === 'custom') { const mins = parseInt(document.getElementById('customMinutes').value); if (!mins || mins < 1) { toast('Enter valid minutes', true); return; } timerTarget = mins * 60; timerSeconds = timerTarget; }
  else { timerSeconds = 0; }
  sessionStart = new Date(); timerRunning = true; timerPaused = false;
  document.getElementById('startBtn').disabled = true;
  document.getElementById('pauseBtn').disabled = false;
  document.getElementById('stopBtn').disabled = false;
  document.getElementById('timerDisplay').classList.add('running');
  document.getElementById('timerLabel').textContent = 'Session in progress…';
  timerInterval = setInterval(tickTimer, 1000);
}

function tickTimer() {
  if (timerMode === 'stopwatch') { timerSeconds++; }
  else { timerSeconds--; if (timerSeconds <= 0) { if (timerMode === 'pomodoro') { handlePomodoroPhaseEnd(); return; } clearInterval(timerInterval); timerRunning = false; document.getElementById('timerDisplay').classList.replace('running', 'warning'); document.getElementById('timerLabel').textContent = '⏰ Timer complete!'; toast('⏰ Custom timer finished!'); return; } if (timerSeconds <= 60) document.getElementById('timerDisplay').classList.add('warning'); }
  updateTimerDisplay();
}

function handlePomodoroPhaseEnd() { clearInterval(timerInterval); if (pomodoroPhase === 'work') { pomodoroCount++; renderPomodoroDots(); pomodoroPhase = 'break'; timerTarget = 5 * 60; timerSeconds = timerTarget; toast('🍅 Work phase done! Break time (5 min)'); document.getElementById('timerLabel').textContent = '☕ Break time!'; } else { pomodoroPhase = 'work'; timerTarget = 25 * 60; timerSeconds = timerTarget; toast('▶ Break over! Back to work (25 min)'); document.getElementById('timerLabel').textContent = 'Work session'; } document.getElementById('timerDisplay').classList.remove('warning'); timerInterval = setInterval(tickTimer, 1000); updateTimerDisplay(); }

function renderPomodoroDots() { const el = document.getElementById('pomodoroStatus'); const dots = Array.from({ length: 4 }, (_, i) => `<div class="pomo-dot ${i < pomodoroCount ? 'done' : ''}"></div>`).join(''); el.innerHTML = `<div>${pomodoroCount}/4 pomodoros</div><div class="pomodoro-dots">${dots}</div>`; }
function updateTimerDisplay() { const h = Math.floor(timerSeconds / 3600), m = Math.floor((timerSeconds % 3600) / 60), s = timerSeconds % 60; document.getElementById('timerDisplay').textContent = `${pad(h)}:${pad(m)}:${pad(s)}`; }

function pauseTimer() { if (!timerRunning) return; if (timerPaused) { clearInterval(timerInterval); timerInterval = setInterval(tickTimer, 1000); timerPaused = false; document.getElementById('pauseBtn').textContent = '⏸ Pause'; document.getElementById('timerDisplay').classList.replace('paused', 'running'); document.getElementById('timerLabel').textContent = 'Session in progress…'; } else { clearInterval(timerInterval); timerPaused = true; document.getElementById('pauseBtn').textContent = '▶ Resume'; document.getElementById('timerDisplay').classList.replace('running', 'paused'); document.getElementById('timerLabel').textContent = 'Paused'; } }

async function stopTimer() {
  if (!timerRunning && !timerPaused) return;
  clearInterval(timerInterval); timerRunning = false; timerPaused = false;
  const elapsed = timerMode === 'stopwatch' ? timerSeconds : (timerTarget - timerSeconds + (pomodoroCount * 25 * 60));
  const subjectId = document.getElementById('timerSubject').value;
  const note = document.getElementById('timerNote').value.trim();
  if (elapsed < 10) { toast('Session too short to save', true); resetTimerUI(); return; }
  try {
    await dbInsert('sessions', { subject_id: subjectId || null, note: note || null, started_at: sessionStart.toISOString(), ended_at: new Date().toISOString(), duration_seconds: elapsed, user_id: currentUser.id });
    toast(`Session saved: ${fmtDuration(elapsed)} ✓`);
    document.getElementById('timerNote').value = '';
    renderTodaysSessions(); renderProgress();
  } catch (e) { toast('Error saving session: ' + e.message, true); }
  resetTimerUI();
}

function resetTimerUI() { clearInterval(timerInterval); timerRunning = timerPaused = false; timerSeconds = pomodoroCount = 0; document.getElementById('startBtn').disabled = false; document.getElementById('pauseBtn').disabled = true; document.getElementById('stopBtn').disabled = true; document.getElementById('pauseBtn').textContent = '⏸ Pause'; document.getElementById('timerDisplay').className = 'timer-display'; document.getElementById('timerDisplay').textContent = '00:00:00'; document.getElementById('timerLabel').textContent = 'Ready to study'; document.getElementById('pomodoroStatus').innerHTML = ''; }

function renderTodaysSessions() {
  const today = new Date().toDateString();
  const todayS = state.sessions.filter(s => new Date(s.started_at).toDateString() === today);
  const el = document.getElementById('todaysSessions');
  if (!todayS.length) { el.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px">No sessions today yet</div>'; document.getElementById('todayTotal').textContent = 'Total: 0h 0m'; return; }
  const total = todayS.reduce((a, s) => a + s.duration_seconds, 0);
  el.innerHTML = todayS.map(s => { const sub = state.subjects.find(x => x.id === s.subject_id); return `<div class="session-item"><div><div class="session-subject">${sub ? esc(sub.name) : '(No subject)'}</div>${s.note ? `<div class="session-note">${esc(s.note)}</div>` : ''}</div><div class="session-time">${fmtDuration(s.duration_seconds)}</div></div>`; }).join('');
  document.getElementById('todayTotal').textContent = `Total: ${fmtDurationLong(total)}`;
}

// ─── PROGRESS ───
let charts = {};
function renderProgress() { renderHoursChart(); renderSyllabusChart(); renderActivityChart(); renderStats(); }
function destroyChart(k) { if (charts[k]) { charts[k].destroy(); delete charts[k]; } }
function chartDefaults() { return { color: '#9ca3af', plugins: { legend: { labels: { color: '#9ca3af', font: { family: 'DM Sans' } } } }, scales: { x: { ticks: { color: '#6b7280' }, grid: { color: '#252a38' } }, y: { ticks: { color: '#6b7280' }, grid: { color: '#252a38' } } } }; }
function renderHoursChart() { destroyChart('hours'); const ctx = document.getElementById('hoursChart'); if (!ctx) return; const data = state.subjects.map(s => ({ name: s.name, color: s.color, hours: state.sessions.filter(x => x.subject_id === s.id).reduce((a, x) => a + x.duration_seconds, 0) / 3600 })); charts.hours = new Chart(ctx, { type: 'bar', data: { labels: data.map(d => d.name), datasets: [{ label: 'Hours', data: data.map(d => +d.hours.toFixed(2)), backgroundColor: data.map(d => d.color + 'cc'), borderColor: data.map(d => d.color), borderWidth: 1, borderRadius: 6 }] }, options: { ...chartDefaults(), plugins: { legend: { display: false } }, responsive: true, scales: { x: { ticks: { color: '#6b7280' }, grid: { color: '#252a38' } }, y: { ticks: { color: '#6b7280' }, grid: { color: '#252a38' }, beginAtZero: true } } } }); }
function renderSyllabusChart() { destroyChart('syllabus'); const ctx = document.getElementById('syllabusChart'); if (!ctx) return; charts.syllabus = new Chart(ctx, { type: 'doughnut', data: { labels: ['Pending', 'In Progress', 'Completed'], datasets: [{ data: [state.syllabus.filter(t => t.status === 'pending').length, state.syllabus.filter(t => t.status === 'in-progress').length, state.syllabus.filter(t => t.status === 'completed').length], backgroundColor: ['#1a1e2a', '#5ce1e680', '#c8f56299'], borderColor: ['#252a38', '#5ce1e6', '#c8f562'], borderWidth: 2 }] }, options: { responsive: true, cutout: '65%', plugins: { legend: { labels: { color: '#9ca3af' } } } } }); }
function renderActivityChart() { destroyChart('activity'); const ctx = document.getElementById('activityChart'); if (!ctx) return; const labels = [], values = []; for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); labels.push(d.toLocaleDateString('en', { month: 'short', day: 'numeric' })); values.push(state.sessions.filter(s => new Date(s.started_at).toDateString() === d.toDateString()).reduce((a, s) => a + s.duration_seconds, 0) / 60); } charts.activity = new Chart(ctx, { type: 'line', data: { labels, datasets: [{ label: 'Minutes studied', data: values, borderColor: '#c8f562', backgroundColor: 'rgba(200,245,98,0.08)', fill: true, tension: 0.4, pointBackgroundColor: '#c8f562', pointRadius: 4 }] }, options: { ...chartDefaults(), plugins: { legend: { display: false } }, responsive: true } }); }
function renderStats() { const el = document.getElementById('statsGrid'); const totalSecs = state.sessions.reduce((a, s) => a + s.duration_seconds, 0); const todaySecs = state.sessions.filter(s => new Date(s.started_at).toDateString() === new Date().toDateString()).reduce((a, s) => a + s.duration_seconds, 0); el.innerHTML = [{ val: fmtDurationLong(totalSecs), label: 'Total Study Time' }, { val: fmtDurationLong(todaySecs), label: "Today's Study Time" }, { val: state.subjects.length, label: 'Subjects' }, { val: state.sessions.length, label: 'Sessions' }, { val: `${state.syllabus.filter(t => t.status === 'completed').length}/${state.syllabus.length}`, label: 'Topics Completed' }, { val: `${state.todos.filter(t => t.completed).length}/${state.todos.length}`, label: 'Tasks Done' }].map(s => `<div class="stat-item"><div class="stat-value">${s.val}</div><div class="stat-label">${s.label}</div></div>`).join(''); }

// ─── HISTORY ───
function renderHistory() {
  const from = document.getElementById('historyFrom')?.value, to = document.getElementById('historyTo')?.value, subId = document.getElementById('historySubjectFilter')?.value || 'all';
  const el = document.getElementById('historyList'), sumEl = document.getElementById('historySummary');
  let sessions = [...state.sessions].sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
  if (from) sessions = sessions.filter(s => new Date(s.started_at) >= new Date(from));
  if (to) sessions = sessions.filter(s => new Date(s.started_at) <= new Date(to + 'T23:59:59'));
  if (subId !== 'all') sessions = sessions.filter(s => s.subject_id === subId);
  const totalSecs = sessions.reduce((a, s) => a + s.duration_seconds, 0);
  const uniqueDays = new Set(sessions.map(s => new Date(s.started_at).toDateString())).size;
  sumEl.innerHTML = [{ val: sessions.length, label: 'Sessions' }, { val: fmtDurationLong(totalSecs), label: 'Total Time' }, { val: uniqueDays, label: 'Study Days' }, { val: sessions.length ? fmtDurationLong(Math.round(totalSecs / sessions.length)) : '—', label: 'Avg Session' }].map(s => `<div class="history-stat"><div class="history-stat-val">${s.val}</div><div class="history-stat-label">${s.label}</div></div>`).join('');
  if (!sessions.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">🕓</div><p>No sessions found.</p></div>'; return; }
  el.innerHTML = sessions.map(s => { const sub = state.subjects.find(x => x.id === s.subject_id); return `<div class="history-item"><div class="color-dot" style="background:${sub?.color || '#555'}"></div><div class="history-date">${fmtDateTime(s.started_at)}</div><div style="flex:1"><div class="history-subject-name">${sub ? esc(sub.name) : '(No subject)'}</div>${s.note ? `<div class="history-note">${esc(s.note)}</div>` : ''}</div><div class="history-duration">${fmtDuration(s.duration_seconds)}</div><button class="btn-icon" onclick="deleteSession('${s.id}')">🗑</button></div>`; }).join('');
}
async function deleteSession(id) { await dbDelete('sessions', id); renderHistory(); renderTodaysSessions(); renderProgress(); toast('Session deleted'); }

// ─── HELPERS ───
function pad(n) { return String(n).padStart(2, '0'); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fmtDuration(secs) { const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60; return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`; }
function fmtDurationLong(secs) { const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m}m`; }
function fmtDate(ds) { return ds ? new Date(ds).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' }) : ''; }
function fmtDateTime(ds) { return ds ? new Date(ds).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; }
let toastTimer = null;
function toast(msg, err = false) { const el = document.getElementById('toast'); el.textContent = msg; el.className = 'toast show' + (err ? ' error' : ''); if (toastTimer) clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.className = 'toast'; }, 3000); }