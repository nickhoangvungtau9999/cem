(function () {
  const root = document.getElementById('perf-root');
  if (!root) return;
  const tier = root.dataset.tier;
  const canEdit = tier === 'edit' || tier === 'approve';
  const content = document.getElementById('perf-content');
  let criteria = null;
  let currentEmpId = null;

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function loadFor(empId) {
    currentEmpId = empId;
    content.innerHTML = '<div class="card empty-state">Loading...</div>';
    if (!criteria) criteria = await api('GET', '/api/performance/criteria');
    let notes;
    try {
      notes = await api('GET', `/api/performance/${empId}`);
    } catch (e) {
      content.innerHTML = `<div class="card error">${escapeHtml(e.message)}</div>`;
      return;
    }

    content.innerHTML = `
      ${canEdit ? `
        <div class="card">
          <h2 style="margin-top:0">New note</h2>
          <div style="display:flex; gap:8px; margin-bottom:12px;">
            <button id="tab-positive" class="secondary">+ Positive</button>
            <button id="tab-negative" class="secondary">+ Needs improvement</button>
          </div>
          <div id="perf-form-slot"></div>
        </div>
      ` : ''}
      <div class="card">
        <h2 style="margin-top:0">Note history</h2>
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Criteria</th><th>Note</th><th>Recorded by</th></tr></thead>
          <tbody>
            ${notes.length ? notes.map((n) => `
              <tr>
                <td>${(n.created_at || '').slice(0, 10)}</td>
                <td><span class="badge ${n.tag_type === 'positive' ? 'approved' : n.tag_type === 'negative' ? 'rejected' : 'view'}">${n.tag_type}</span></td>
                <td>${n.criteria.map((c) => escapeHtml(c.item)).join('; ')}</td>
                <td>${escapeHtml(n.note)}</td>
                <td>${escapeHtml(n.created_by_name)}</td>
              </tr>`).join('') : '<tr><td colspan="5" class="empty-state">No notes yet</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    if (canEdit) {
      document.getElementById('tab-positive').addEventListener('click', () => openForm('positive'));
      document.getElementById('tab-negative').addEventListener('click', () => openForm('negative'));
    }
  }

  function openForm(tagType) {
    const slot = document.getElementById('perf-form-slot');
    const groups = criteria[tagType];
    slot.innerHTML = `
      <form id="perf-form">
        ${groups.map((g, gi) => `
          <div style="margin-bottom:10px;">
            <strong>${escapeHtml(g.category)}</strong>
            <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px;">
              ${g.items.map((item, ii) => `
                <label style="border:1px solid var(--border); border-radius:6px; padding:4px 8px; font-size:12.5px; cursor:pointer;">
                  <input type="checkbox" name="item" value="${gi}:${ii}" style="width:auto; padding:0;"> ${escapeHtml(item)}
                </label>
              `).join('')}
            </div>
          </div>
        `).join('')}
        <label>Additional note<textarea name="note" rows="2"></textarea></label>
        <div style="display:flex; gap:6px; margin-top:8px;">
          <button type="submit">Save note</button>
          <button type="button" class="secondary" id="perf-cancel">Cancel</button>
        </div>
        <div class="error" id="perf-form-error"></div>
      </form>
    `;
    document.getElementById('perf-cancel').addEventListener('click', () => { slot.innerHTML = ''; });
    document.getElementById('perf-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const checked = [...ev.target.querySelectorAll('input[name="item"]:checked')].map((cb) => {
        const [gi, ii] = cb.value.split(':').map(Number);
        return { category: groups[gi].category, item: groups[gi].items[ii] };
      });
      const note = new FormData(ev.target).get('note');
      try {
        await api('POST', `/api/performance/${currentEmpId}`, { tag_type: tagType, items: checked, note });
        loadFor(currentEmpId);
      } catch (e) {
        document.getElementById('perf-form-error').textContent = e.message;
      }
    });
  }

  document.getElementById('perf-load-btn').addEventListener('click', () => {
    const id = document.getElementById('perf-emp-id').value.trim();
    if (id) loadFor(id);
  });
  document.getElementById('perf-emp-id').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('perf-load-btn').click();
  });
})();
