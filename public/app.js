const API = '/api';

const COLUMNS = [
  { key: 'saved', label: 'Saved', color: '#90A6B8' },
  { key: 'applied', label: 'Applied', color: '#4FB6A6' },
  { key: 'interview', label: 'Interview', color: '#9E8FD6' },
  { key: 'offer', label: 'Offer', color: '#E3A23F' },
  { key: 'rejected', label: 'Rejected', color: '#C0604D' },
];

let jobsCache = [];

function setStatusline(msg) {
  document.getElementById('statusline').textContent = msg;
}

function scoreClass(score) {
  if (score === null || score === undefined) return 'score-none';
  if (score >= 60) return 'score-high';
  if (score >= 30) return 'score-mid';
  return 'score-low';
}

function scoreLabel(score) {
  return score === null || score === undefined ? 'no resume' : `${score}% match`;
}

function methodLabel(method) {
  if (method === 'embeddings') return 'Scored with semantic embeddings (all-MiniLM-L6-v2)';
  if (method === 'keywords') return 'Scored with keyword overlap (embedding model unavailable)';
  return 'Upload a resume to enable scoring';
}

async function loadStats() {
  const res = await fetch(`${API}/jobs/stats`);
  const stats = await res.json();
  const el = document.getElementById('stats');
  el.innerHTML = `
    <div class="stat"><b>${stats.total || 0}</b>total</div>
    ${COLUMNS.map((c) => `<div class="stat"><b>${stats[c.key] || 0}</b>${c.label.toLowerCase()}</div>`).join('')}
  `;
}

async function loadJobs() {
  const res = await fetch(`${API}/jobs?sort=score`);
  jobsCache = await res.json();
  renderBoard();
}

function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = COLUMNS.map((col) => {
    const jobs = jobsCache.filter((j) => j.status === col.key);
    return `
      <section class="column" style="--col-color:${col.color}">
        <div class="column-head">
          <span>${col.label.toUpperCase()}</span>
          <span class="count">${jobs.length}</span>
        </div>
        <div class="column-body">
          ${
            jobs.length === 0
              ? `<div class="empty-col">Nothing here yet.</div>`
              : jobs.map(cardHtml).join('')
          }
        </div>
      </section>
    `;
  }).join('');

  board.querySelectorAll('.card').forEach((el) => {
    el.addEventListener('click', () => openJobModal(el.dataset.id));
  });
}

function cardHtml(job) {
  return `
    <article class="card" data-id="${job._id}">
      <div class="card-top">
        <div class="card-title">${escapeHtml(job.title)}</div>
        <span class="score-pill ${scoreClass(job.matchScore)}" title="${methodLabel(job.matchMethod)}">${scoreLabel(job.matchScore)}</span>
      </div>
      <div class="card-company">${escapeHtml(job.company)}</div>
      <div class="card-meta">
        <span>${escapeHtml(job.location || '')}</span>
        <span>${job.source}</span>
      </div>
    </article>
  `;
}

function escapeHtml(str = '') {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- Job detail modal ---------- */

function openJobModal(id) {
  const job = jobsCache.find((j) => j._id === id);
  if (!job) return;

  const modal = document.getElementById('jobModal');
  const content = document.getElementById('jobModalContent');

  content.innerHTML = `
    <div class="modal-head">
      <h2>Job details</h2>
      <button class="modal-close" id="closeJobModal">&times;</button>
    </div>
    <div class="job-detail-title">${escapeHtml(job.title)}</div>
    <div class="job-detail-company">${escapeHtml(job.company)} — ${escapeHtml(job.location || '')}</div>

    <div class="job-detail-row">
      <span class="score-pill ${scoreClass(job.matchScore)}">${scoreLabel(job.matchScore)}</span>
      <span style="font-size:11px;color:var(--text-dim)">${methodLabel(job.matchMethod)}</span>
    </div>
    <div class="job-detail-row">
      ${(job.matchedKeywords || []).map((k) => `<span class="keyword-tag">${escapeHtml(k)}</span>`).join('')}
    </div>

    <div class="job-detail-row">
      <label for="statusSelect">Status</label>
      <select id="statusSelect">
        ${COLUMNS.map((c) => `<option value="${c.key}" ${c.key === job.status ? 'selected' : ''}>${c.label}</option>`).join('')}
      </select>
      <a href="${job.url}" target="_blank" rel="noopener" class="btn btn-ghost">Open posting ↗</a>
    </div>

    <div class="job-detail-desc">${escapeHtml((job.description || '').slice(0, 1500))}</div>

    <label for="notesArea" style="font-size:12.5px;color:var(--text-dim)">Notes</label>
    <textarea id="notesArea" class="job-notes" rows="3" placeholder="Interview prep, contacts, follow-up plan...">${escapeHtml(job.notes || '')}</textarea>

    <div class="modal-row">
      <button class="btn btn-ghost" id="deleteJobBtn">Remove</button>
      <button class="btn btn-primary" id="saveJobBtn">Save changes</button>
    </div>
  `;

  modal.classList.add('open');
  document.getElementById('closeJobModal').onclick = () => modal.classList.remove('open');

  document.getElementById('saveJobBtn').onclick = async () => {
    const status = document.getElementById('statusSelect').value;
    const notes = document.getElementById('notesArea').value;
    await fetch(`${API}/jobs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, notes }),
    });
    modal.classList.remove('open');
    setStatusline(`Updated "${job.title}".`);
    await Promise.all([loadJobs(), loadStats()]);
  };

  document.getElementById('deleteJobBtn').onclick = async () => {
    if (!confirm('Remove this job from your tracker?')) return;
    await fetch(`${API}/jobs/${id}`, { method: 'DELETE' });
    modal.classList.remove('open');
    setStatusline(`Removed "${job.title}".`);
    await Promise.all([loadJobs(), loadStats()]);
  };
}

/* ---------- Resume manager ---------- */

const resumeModal = document.getElementById('resumeModal');

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

async function loadActiveResumeLabel() {
  try {
    const res = await fetch(`${API}/resumes`);
    const { resumes, activeResumeId } = await res.json();
    const active = resumes.find((r) => r._id === activeResumeId);
    document.getElementById('activeResumeLabel').textContent = active ? active.name : 'none';
  } catch {
    document.getElementById('activeResumeLabel').textContent = 'none';
  }
}

async function renderResumeList() {
  const res = await fetch(`${API}/resumes`);
  const { resumes, activeResumeId } = await res.json();
  const listEl = document.getElementById('resumeList');

  if (resumes.length === 0) {
    listEl.innerHTML = `<div class="empty-resumes">No resumes saved yet — add one below.</div>`;
    return;
  }

  listEl.innerHTML = resumes
    .map((r) => {
      const isActive = r._id === activeResumeId;
      return `
        <div class="resume-row ${isActive ? 'is-active' : ''}">
          <div>
            <div class="resume-row-name">${escapeHtml(r.name)}</div>
            <div class="resume-row-meta">Added ${fmtDate(r.createdAt)}</div>
          </div>
          <div class="resume-row-actions">
            ${
              isActive
                ? `<span class="active-badge">ACTIVE</span>`
                : `<button class="btn btn-ghost" data-activate="${r._id}">Activate</button>`
            }
            <button class="btn btn-ghost" data-delete="${r._id}" data-name="${escapeHtml(r.name)}">Delete</button>
          </div>
        </div>
      `;
    })
    .join('');

  listEl.querySelectorAll('[data-activate]').forEach((btn) => {
    btn.onclick = async () => {
      setStatusline('Activating resume and rescoring jobs...');
      const res = await fetch(`${API}/resumes/${btn.dataset.activate}/activate`, { method: 'POST' });
      const data = await res.json();
      setStatusline(`Resume activated. Rescored ${data.rescored ?? 0} jobs.`);
      await Promise.all([renderResumeList(), loadActiveResumeLabel(), loadJobs(), loadStats()]);
    };
  });

  listEl.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm(`Delete "${btn.dataset.name}"? This can't be undone.`)) return;
      await fetch(`${API}/resumes/${btn.dataset.delete}`, { method: 'DELETE' });
      setStatusline(`Deleted "${btn.dataset.name}".`);
      await Promise.all([renderResumeList(), loadActiveResumeLabel()]);
    };
  });
}

document.getElementById('resumeBtn').onclick = async () => {
  document.getElementById('newResumeName').value = '';
  document.getElementById('resumeText').value = '';
  await renderResumeList();
  resumeModal.classList.add('open');
};

document.getElementById('closeResumeModal').onclick = () => resumeModal.classList.remove('open');

document.getElementById('saveResumeBtn').onclick = async () => {
  const name = document.getElementById('newResumeName').value.trim();
  const text = document.getElementById('resumeText').value;

  if (!name) return setStatusline('Give this resume a name first.');
  if (!text.trim()) return setStatusline('Paste some resume text, or upload a PDF instead.');

  setStatusline('Saving new resume and rescoring jobs...');
  const res = await fetch(`${API}/resumes/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, text }),
  });
  const data = await res.json();
  setStatusline(`"${name}" saved and activated. Rescored ${data.rescored ?? 0} jobs.`);
  document.getElementById('newResumeName').value = '';
  document.getElementById('resumeText').value = '';
  await Promise.all([renderResumeList(), loadActiveResumeLabel(), loadJobs(), loadStats()]);
};

document.getElementById('resumeFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const name = document.getElementById('newResumeName').value.trim() || file.name.replace(/\.pdf$/i, '');
  setStatusline('Uploading resume PDF...');

  const formData = new FormData();
  formData.append('resume', file);
  formData.append('name', name);

  const res = await fetch(`${API}/resumes/upload`, { method: 'POST', body: formData });
  const data = await res.json();
  setStatusline(`"${data.resume?.name}" saved and activated. Rescored ${data.rescored ?? 0} jobs.`);
  e.target.value = '';
  await Promise.all([renderResumeList(), loadActiveResumeLabel(), loadJobs(), loadStats()]);
});

/* ---------- Fetch button ---------- */

document.getElementById('fetchBtn').onclick = async () => {
  setStatusline('Fetching new postings from job APIs...');
  try {
    const res = await fetch(`${API}/jobs/fetch`, { method: 'POST' });
    const data = await res.json();
    setStatusline(
      `Fetched ${data.fetched} postings, ${data.keptAfterFilter} matched your keywords ` +
      `(${data.inserted} new, ${data.updated} updated).`
    );
  } catch (err) {
    setStatusline('Fetch failed — check server logs.');
  }
  await Promise.all([loadJobs(), loadStats()]);
};

/* ---------- Init ---------- */

[resumeModal, document.getElementById('jobModal')].forEach((modal) => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });
});

(async function init() {
  setStatusline('Loading board...');
  await Promise.all([loadJobs(), loadStats(), loadActiveResumeLabel()]);
  setStatusline('Ready.');
})();
