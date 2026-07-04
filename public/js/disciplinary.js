(function () {
  const root = document.getElementById('disc-root');
  if (!root) return;
  const tier = root.dataset.tier;
  const canEdit = tier === 'edit' || tier === 'approve';
  const canApprove = tier === 'approve';

  const statusSelect = document.getElementById('disc-status');
  const table = document.getElementById('disc-table').querySelector('tbody');
  const btnSlot = document.getElementById('disc-new-btn-slot');
  const formSlot = document.getElementById('disc-form-slot');

  let matrix = { levels: [], violations: [] };

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function statusBadgeClass(s) {
    if (s === 'Approved') return 'approved';
    if (s === 'Rejected') return 'rejected';
    return 'pending';
  }

  async function loadCases() {
    table.innerHTML = '<tr><td colspan="6" class="empty-state">Loading...</td></tr>';
    const params = new URLSearchParams({ status: statusSelect.value });
    try {
      const rows = await api('GET', `/api/disciplinary/cases?${params}`);
      if (!rows.length) { table.innerHTML = '<tr><td colspan="6" class="empty-state">No cases</td></tr>'; return; }
      table.innerHTML = rows.map((c) => `
        <tr>
          <td>${(c.created_at || '').slice(0, 10)}</td>
          <td><a href="/employees/${c.employee_id}">${escapeHtml(c.employee_name)}</a> <span style="color:var(--text-dim)">(${c.employee_id})</span></td>
          <td>${escapeHtml(c.violation) || escapeHtml(c.category) || '(unspecified)'}</td>
          <td>${escapeHtml(c.level_code)}</td>
          <td><span class="badge ${statusBadgeClass(c.approval_status)}">${c.approval_status}</span></td>
          <td>${renderActions(c)}</td>
        </tr>
      `).join('');
      if (canApprove) {
        table.querySelectorAll('[data-decide]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              await api('PATCH', `/api/disciplinary/cases/${btn.dataset.id}/decide`, { decision: btn.dataset.decide });
              loadCases();
            } catch (e) { alert(e.message); }
          });
        });
      }
    } catch (e) {
      table.innerHTML = `<tr><td colspan="6" class="error">${escapeHtml(e.message)}</td></tr>`;
    }
  }

  function renderActions(c) {
    if (c.approval_status !== 'Pending Approval') {
      return c.approved_by_name ? `by ${escapeHtml(c.approved_by_name)}` : '';
    }
    if (!canApprove) return '<span style="color:var(--text-dim)">Awaiting approval</span>';
    return `
      <button data-decide="Approved" data-id="${c.id}" style="padding:4px 8px;">Approve</button>
      <button data-decide="Rejected" data-id="${c.id}" class="secondary" style="padding:4px 8px;">Reject</button>
    `;
  }

  function renderNewButton() {
    if (!canEdit) return;
    btnSlot.innerHTML = '<button id="disc-new-btn" class="secondary">+ New case</button>';
    document.getElementById('disc-new-btn').addEventListener('click', () => {
      formSlot.innerHTML ? closeForm() : openForm();
    });
  }

  function closeForm() { formSlot.innerHTML = ''; }

  function openForm() {
    const categories = [...new Set(matrix.violations.map((v) => v.category))];
    formSlot.innerHTML = `
      <form id="disc-create-form" style="margin-top:12px; display:flex; flex-direction:column; gap:8px; max-width:480px;">
        <label>Employee ID<input name="employee_id" required placeholder="e.g. 00584"></label>
        <label>Violation
          <select name="violation" required>
            <option value="">-- Select violation --</option>
            ${categories.map((cat) => `
              <optgroup label="${escapeHtml(cat)}">
                ${matrix.violations.filter((v) => v.category === cat).map((v) => `<option value="${escapeHtml(v.violation)}" data-category="${escapeHtml(v.category)}">${escapeHtml(v.violation)}</option>`).join('')}
              </optgroup>
            `).join('')}
          </select>
        </label>
        <div id="disc-suggest" style="color:var(--text-dim); font-size:12.5px;"></div>
        <label>Level to apply
          <select name="level_code" required>
            <option value="">-- Select level --</option>
            ${matrix.levels.map((l) => `<option value="${escapeHtml(l.level_code)}">${escapeHtml(l.level_code)} — ${escapeHtml(l.action_name)}</option>`).join('')}
          </select>
        </label>
        <label>Notes<textarea name="notes" rows="3"></textarea></label>
        <div style="display:flex; gap:6px;">
          <button type="submit">Create case</button>
          <button type="button" class="secondary" id="disc-cancel">Cancel</button>
        </div>
        <div class="error" id="disc-create-error"></div>
      </form>
    `;
    const form = document.getElementById('disc-create-form');
    document.getElementById('disc-cancel').addEventListener('click', closeForm);

    async function trySuggest() {
      const empId = form.employee_id.value.trim();
      const violation = form.violation.value;
      if (!empId || !violation) return;
      try {
        const s = await api('GET', `/api/disciplinary/suggest?employee_id=${encodeURIComponent(empId)}&violation=${encodeURIComponent(violation)}`);
        document.getElementById('disc-suggest').textContent =
          `Occurrence #${s.occurrence} (${s.priorApprovedCount} prior approved case(s))` +
          (s.suggestedLevelCode ? ` — suggested level: ${s.suggestedLevelCode}` : '');
        if (s.suggestedLevelCode) form.level_code.value = s.suggestedLevelCode;
      } catch (e) { /* ignore — employee may not exist yet while typing */ }
    }
    form.employee_id.addEventListener('blur', trySuggest);
    form.violation.addEventListener('change', trySuggest);

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(form);
      const violationOpt = form.violation.selectedOptions[0];
      try {
        await api('POST', '/api/disciplinary/cases', {
          employee_id: fd.get('employee_id'),
          violation: fd.get('violation'),
          category: violationOpt ? violationOpt.dataset.category : null,
          level_code: fd.get('level_code'),
          notes: fd.get('notes'),
          source: 'manual',
        });
        closeForm();
        loadCases();
      } catch (e) {
        document.getElementById('disc-create-error').textContent = e.message;
      }
    });
  }

  async function init() {
    matrix = await api('GET', '/api/disciplinary/matrix');
    renderNewButton();
    loadCases();
  }
  statusSelect.addEventListener('change', loadCases);
  init();
})();
