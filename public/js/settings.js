(function () {
  const usersTable = document.getElementById('users-table');
  if (!usersTable) return;

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ── Import ───────────────────────────────────────────────────────────────
  document.getElementById('import-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const box = document.getElementById('import-result');
    box.innerHTML = 'Importing...';
    try {
      const res = await fetch('/api/import/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      box.innerHTML = '<table><thead><tr><th>Sheet</th><th>Status</th><th>Added</th><th>Skipped</th></tr></thead><tbody>' +
        data.results.map((r) => `<tr><td>${escapeHtml(r.sheet)}</td><td><span class="badge ${r.status === 'ok' ? 'approved' : r.status === 'error' ? 'rejected' : 'view'}">${r.status}</span></td><td>${r.added ?? ''}</td><td>${r.skipped ?? ''}</td></tr>`).join('') +
        '</tbody></table>';
      loadImportLog();
    } catch (e) {
      box.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
    }
  });

  async function loadImportLog() {
    const tbody = document.getElementById('import-log-table').querySelector('tbody');
    try {
      const rows = await api('GET', '/api/import/log');
      tbody.innerHTML = rows.length ? rows.map((r) => `
        <tr>
          <td>${r.created_at}</td>
          <td>${escapeHtml(r.filename)}</td>
          <td>${escapeHtml(r.sheet_name)}</td>
          <td>${r.rows_added}</td>
          <td>${r.rows_skipped}</td>
          <td><span class="badge ${r.status === 'ok' ? 'approved' : 'rejected'}">${r.status}</span>${r.error ? ' ' + escapeHtml(r.error) : ''}</td>
        </tr>
      `).join('') : '<tr><td colspan="6" class="empty-state">No imports yet</td></tr>';
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" class="error">${escapeHtml(e.message)}</td></tr>`;
    }
  }

  // ── Users ────────────────────────────────────────────────────────────────
  async function loadUsers() {
    const tbody = usersTable.querySelector('tbody');
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Loading...</td></tr>';
    try {
      const rows = await api('GET', '/api/settings/users');
      tbody.innerHTML = rows.map((u) => `
        <tr>
          <td>${escapeHtml(u.username)}</td>
          <td>${escapeHtml(u.name)}</td>
          <td>${u.role}</td>
          <td>${u.employee_id ? `<a href="/employees/${u.employee_id}">${escapeHtml(u.employee_name)} (${u.employee_id})</a>` : '(not linked)'}</td>
          <td>${u.app_pos_level ?? ''}</td>
          <td><span class="badge ${u.effective_tier === 'approve' ? 'approve' : u.effective_tier === 'edit' ? 'edit' : 'view'}">${u.effective_tier}</span></td>
          <td>
            <select data-override="${u.id}">
              <option value="" ${!u.permission_override ? 'selected' : ''}>(from app_pos_level)</option>
              <option value="view" ${u.permission_override === 'view' ? 'selected' : ''}>view</option>
              <option value="edit" ${u.permission_override === 'edit' ? 'selected' : ''}>edit</option>
              <option value="approve" ${u.permission_override === 'approve' ? 'selected' : ''}>approve</option>
            </select>
          </td>
          <td><button data-delete="${u.id}" class="danger" style="padding:4px 8px;">Delete</button></td>
        </tr>
      `).join('');

      tbody.querySelectorAll('[data-override]').forEach((sel) => {
        sel.addEventListener('change', async () => {
          try { await api('PATCH', `/api/settings/users/${sel.dataset.override}`, { permission_override: sel.value }); loadUsers(); }
          catch (e) { alert(e.message); }
        });
      });
      tbody.querySelectorAll('[data-delete]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this user?')) return;
          try { await api('DELETE', `/api/settings/users/${btn.dataset.delete}`); loadUsers(); }
          catch (e) { alert(e.message); }
        });
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8" class="error">${escapeHtml(e.message)}</td></tr>`;
    }
  }

  document.getElementById('user-new-btn').addEventListener('click', () => {
    const slot = document.getElementById('user-form-slot');
    if (slot.innerHTML) { slot.innerHTML = ''; return; }
    slot.innerHTML = `
      <form id="user-create-form" style="margin-top:12px; display:flex; gap:6px; flex-wrap:wrap; align-items:flex-end;">
        <label>Username<input name="username" required></label>
        <label>Password<input name="password" type="password" required></label>
        <label>Display name<input name="name" required></label>
        <label>Role
          <select name="role"><option value="user">user</option><option value="admin">admin</option></select>
        </label>
        <label>Linked employee ID<input name="employee_id" placeholder="optional"></label>
        <button type="submit">Create</button>
        <div class="error" id="user-create-error" style="width:100%"></div>
      </form>
    `;
    document.getElementById('user-create-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      try {
        await api('POST', '/api/settings/users', Object.fromEntries(fd.entries()));
        slot.innerHTML = '';
        loadUsers();
      } catch (e) {
        document.getElementById('user-create-error').textContent = e.message;
      }
    });
  });

  loadImportLog();
  loadUsers();
})();
