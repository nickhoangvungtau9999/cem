// public/js/employees.js — list + detail pages for the Employee module.

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── List page ────────────────────────────────────────────────────────────────
(function initList() {
  const table = document.getElementById('emp-table');
  if (!table) return;
  const tbody = table.querySelector('tbody');
  const searchInput = document.getElementById('emp-search');
  const statusSelect = document.getElementById('emp-status');
  let debounceTimer;

  async function load() {
    const params = new URLSearchParams({ search: searchInput.value, status: statusSelect.value });
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading...</td></tr>';
    try {
      const rows = await api('GET', `/api/employees?${params}`);
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No results</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map((r) => `
        <tr style="cursor:pointer" onclick="window.location.href='/employees/${r.id}'">
          <td>${r.id}</td>
          <td>${escapeHtml(r.full_name)}</td>
          <td>${escapeHtml(r.position)}</td>
          <td>${r.level_name ?? ''}</td>
          <td>${escapeHtml(r.pickup_point)}</td>
          <td><span class="badge ${r.status === 'Active' ? 'edit' : 'view'}">${r.status}</span></td>
        </tr>
      `).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" class="error">${escapeHtml(e.message)}</td></tr>`;
    }
  }

  searchInput.addEventListener('input', () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(load, 250); });
  statusSelect.addEventListener('change', load);
  load();
})();

// ── Detail page ──────────────────────────────────────────────────────────────
(function initDetail() {
  const root = document.getElementById('emp-root');
  if (!root) return;
  const empId = root.dataset.empId;
  const tier = root.dataset.tier;
  const canEdit = tier === 'edit' || tier === 'approve';

  async function render() {
    let data, exposure;
    try {
      data = await api('GET', `/api/employees/${empId}`);
      exposure = await api('GET', `/api/exposure/summary/${empId}`).catch(() => []);
    } catch (e) {
      root.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
      return;
    }
    const { employee: e, history, relations } = data;

    root.innerHTML = `
      <h1>${escapeHtml(e.full_name)} <span class="badge ${e.status === 'Active' ? 'edit' : 'view'}">${e.status}</span></h1>
      <p class="subtitle">${escapeHtml(e.id)} · ${escapeHtml(e.position)} ${e.nick_name ? '· "' + escapeHtml(e.nick_name) + '"' : ''}</p>

      <div class="grid-2">
        <div class="card">
          <h2 style="margin-top:0">Details</h2>
          <table>
            <tr><th>Rank level</th><td>${e.level_name ?? ''}</td></tr>
            <tr><th>App pos level</th><td>${e.app_pos_level ?? '(no access yet)'}</td></tr>
            <tr><th>Email</th><td>${escapeHtml(e.email)}</td></tr>
            <tr><th>Phone</th><td>${escapeHtml(e.mobile_phone)}</td></tr>
            <tr><th>Mentor</th><td>${escapeHtml(e.mentor_name)} ${e.mentor_id ? '(' + e.mentor_id + ')' : ''}</td></tr>
            <tr><th>Hire date</th><td>${e.hire_date ?? ''}</td></tr>
            <tr><th>Last working date</th><td>${e.last_working_date ?? ''}</td></tr>
            <tr><th>Last promotion date</th><td>${e.promotion_date ?? ''}</td></tr>
            <tr><th>Pickup point</th><td>${escapeHtml(e.pickup_point)}</td></tr>
            <tr><th>Reward</th><td>${escapeHtml(e.reward)}</td></tr>
          </table>
          ${canEdit ? '<button id="edit-btn" class="secondary" style="margin-top:12px">Edit details</button>' : ''}
          <div id="edit-form-slot"></div>
        </div>

        <div class="card">
          <h2 style="margin-top:0">Family / couple relations</h2>
          <table>
            <thead><tr><th>Relation</th><th>Employee</th><th>Position</th></tr></thead>
            <tbody>
              ${relations.length ? relations.map((r) => `
                <tr>
                  <td>${escapeHtml(r.relation)}</td>
                  <td><a href="/employees/${r.relation_employee_id}">${escapeHtml(r.relation_name)} (${r.relation_employee_id})</a></td>
                  <td>${escapeHtml(r.relation_position)}</td>
                </tr>`).join('') : '<tr><td colspan="3" class="empty-state">None declared</td></tr>'}
            </tbody>
          </table>
          ${canEdit ? `
            <form id="rel-form" style="margin-top:12px; display:flex; gap:6px;">
              <input name="relation" placeholder="Relation (Wife/Husband/Sibling...)" required style="flex:1">
              <input name="relation_employee_id" placeholder="Related employee ID" required style="width:160px">
              <button type="submit">Add</button>
            </form>
            <div class="error" id="rel-error"></div>
          ` : ''}
        </div>
      </div>

      <div class="card">
        <h2 style="margin-top:0">Work history</h2>
        <table>
          <thead><tr><th>Effective date</th><th>Change</th><th>Position</th><th>Department</th></tr></thead>
          <tbody>
            ${history.length ? history.map((h) => `
              <tr>
                <td>${h.effective_date ?? ''}</td>
                <td>${escapeHtml(h.action_change)}</td>
                <td>${escapeHtml(h.position)}</td>
                <td>${escapeHtml(h.department)}</td>
              </tr>`).join('') : '<tr><td colspan="4" class="empty-state">No data yet</td></tr>'}
          </tbody>
        </table>
        ${canEdit ? `
          <form id="hist-form" style="margin-top:12px; display:flex; gap:6px; flex-wrap:wrap;">
            <select name="action_change" required>
              <option value="">-- Change type --</option>
              <option>Begin</option><option>New Contract</option><option>Promotion</option>
              <option>Transfer</option><option>Working Type Change</option><option>Rehired</option><option>Resignation</option>
            </select>
            <input type="date" name="effective_date" required>
            <input name="position" placeholder="Position">
            <input name="department" placeholder="Department">
            <button type="submit">Add</button>
          </form>
          <div class="error" id="hist-error"></div>
        ` : ''}
      </div>

      <div class="card">
        <h2 style="margin-top:0">Exposure — actual game interaction</h2>
        <table>
          <thead><tr><th>Game</th><th>Role</th><th>Sessions</th><th>Last</th></tr></thead>
          <tbody>
            ${exposure && exposure.length ? exposure.map((x) => `
              <tr>
                <td>${escapeHtml(x.game)}</td>
                <td>${escapeHtml(x.function)}</td>
                <td>${x.sessions}</td>
                <td>${x.last_date ?? ''}</td>
              </tr>`).join('') : '<tr><td colspan="4" class="empty-state">No exposure data yet</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    if (canEdit) {
      document.getElementById('edit-btn')?.addEventListener('click', () => showEditForm(e));
      document.getElementById('rel-form')?.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const form = new FormData(ev.target);
        try {
          await api('POST', `/api/employees/${empId}/relations`, {
            relation: form.get('relation'),
            relation_employee_id: form.get('relation_employee_id'),
          });
          render();
        } catch (err) {
          document.getElementById('rel-error').textContent = err.message;
        }
      });
      document.getElementById('hist-form')?.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const form = new FormData(ev.target);
        try {
          await api('POST', `/api/employees/${empId}/history`, {
            action_change: form.get('action_change'),
            effective_date: form.get('effective_date'),
            position: form.get('position'),
            department: form.get('department'),
          });
          render();
        } catch (err) {
          document.getElementById('hist-error').textContent = err.message;
        }
      });
    }
  }

  function showEditForm(e) {
    const slot = document.getElementById('edit-form-slot');
    slot.innerHTML = `
      <form id="edit-form" style="margin-top:12px; display:flex; flex-direction:column; gap:6px;">
        <label>Full name<input name="full_name" value="${escapeHtml(e.full_name)}"></label>
        <label>Position<input name="position" value="${escapeHtml(e.position)}"></label>
        <label>Email<input name="email" value="${escapeHtml(e.email)}"></label>
        <label>Phone<input name="mobile_phone" value="${escapeHtml(e.mobile_phone)}"></label>
        <label>Pickup point<input name="pickup_point" value="${escapeHtml(e.pickup_point)}"></label>
        <label>Status
          <select name="status">
            <option ${e.status === 'Active' ? 'selected' : ''}>Active</option>
            <option ${e.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
          </select>
        </label>
        <div style="display:flex; gap:6px;">
          <button type="submit">Save</button>
          <button type="button" class="secondary" id="cancel-edit">Cancel</button>
        </div>
        <div class="error" id="edit-error"></div>
      </form>
    `;
    document.getElementById('cancel-edit').addEventListener('click', () => { slot.innerHTML = ''; });
    document.getElementById('edit-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const form = new FormData(ev.target);
      try {
        await api('PATCH', `/api/employees/${empId}`, Object.fromEntries(form.entries()));
        render();
      } catch (err) {
        document.getElementById('edit-error').textContent = err.message;
      }
    });
  }

  render();
})();
