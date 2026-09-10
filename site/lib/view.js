import { latestEntries, METRIC_COLUMNS, SCOPES, selectEntries, SORT_COLUMNS, summarizeBoards } from "./leaderboard.js";
import { archiveUrl, escapeHtml as html, formatDate, formatMetric, formatNumber } from "./format.js";

export function renderHeading(column) {
  return `<th scope="col" data-column="${column.key}"${column.type === "text" ? ' class="algorithm-column"' : ""}>
    <button type="button" class="sort-button" data-sort="${column.key}" title="${html(column.description)}">
      ${column.label}<span aria-hidden="true"></span>
    </button>
  </th>`;
}

export function renderRow(entry, index, board, sortKey) {
  const active = key => sortKey === key ? " active-sort" : "";
  const archive = archiveUrl(entry, board);
  const commit = String(entry.algorithm_commit ?? "");
  return `<tr>
    <td class="rank-column">${String(index + 1).padStart(2, "0")}</td>
    <th scope="row" class="algorithm-column${active("display_name")}">
      <span class="algorithm-name">${html(entry.display_name)}</span>
      <span class="algorithm-meta"><code title="${html(commit)}">${html(commit.slice(0, 8)) || "—"}</code> · ${formatNumber(entry.cases)} cases</span>
    </th>
    <td><span class="scope-badge" title="${html(SCOPES[entry.scope] ?? entry.scope)}">${html(entry.scope ?? "—")}</span></td>
    ${METRIC_COLUMNS.map(column => `<td class="number${active(column.key)}">${formatMetric(entry.metrics[column.key], column.type)}</td>`).join("")}
    <td>${archive ? `<a class="run-link" href="${html(archive)}" aria-label="${html(entry.display_name)} archived metrics">Metrics <span aria-hidden="true">↗</span></a>` : '<span class="muted">—</span>'}</td>
  </tr>`;
}

export function createView(document) {
  const element = id => document.getElementById(id);
  const filters = element("filter-controls");
  const body = element("leaderboard-body");
  const table = element("results-panel");
  const sortSelect = element("sort-select");
  const search = element("algorithm-search");

  return {
    loading() {
      filters.disabled = true;
      element("result-count").textContent = "Loading";
      table.setAttribute("aria-busy", "true");
      element("load-error").hidden = true;
      body.innerHTML = '<tr><td colspan="11" class="empty-state">Loading archived evaluation results…</td></tr>';
    },

    initialize({ boards, generatedAt }) {
      const summary = summarizeBoards(boards);
      for (const key of ["algorithms", "datasets", "cases"]) {
        element(`total-${key}`).textContent = formatNumber(summary[key]);
      }
      element("updated-at").textContent = formatDate(generatedAt);
      element("benchmark-tabs").innerHTML = boards.map((board, index) => {
        const benchmark = board.benchmark;
        return `<button type="button" role="tab" id="benchmark-tab-${index}" data-id="${html(benchmark.id)}" aria-controls="results-panel">
          <span class="dataset-index">${String(index + 1).padStart(2, "0")}</span>
          <span><strong>${html(benchmark.title)}</strong><small>${formatNumber(benchmark.dataset_cases)} cases · ${formatNumber(benchmark.train_cases)} train / ${formatNumber(benchmark.test_cases)} test</small></span>
          <span class="dataset-arrow" aria-hidden="true">↗</span>
        </button>`;
      }).join("");
      element("leaderboard-head").innerHTML = `<tr>
        <th scope="col" class="rank-column">#</th>${renderHeading(SORT_COLUMNS[0])}
        <th scope="col" title="The evaluated data scope for each row">Scope</th>
        ${METRIC_COLUMNS.map(renderHeading).join("")}<th scope="col">Run</th>
      </tr>`;
      sortSelect.innerHTML = SORT_COLUMNS.map(column => `<option value="${column.key}">${column.label}</option>`).join("");
      element("scope-filter").innerHTML = '<option value="">All scopes</option>'
        + Object.entries(SCOPES).map(([key, label]) => `<option value="${key}">${label}</option>`).join("");
      filters.disabled = false;
      table.setAttribute("aria-busy", "false");
    },

    render(boards, state) {
      const board = boards.find(item => item.benchmark.id === state.boardId);
      const entries = selectEntries(board, state);
      const total = latestEntries(board).length;
      if (search.value !== state.query) search.value = state.query;
      sortSelect.value = state.sortKey;
      element("scope-filter").value = state.scope;
      const ascending = state.sortDirection === "asc";
      element("sort-direction").textContent = ascending ? "Ascending ↑" : "Descending ↓";
      element("sort-direction").setAttribute("aria-label", `${ascending ? "Ascending" : "Descending"} order; switch to ${ascending ? "descending" : "ascending"}`);
      element("result-count").textContent = `Showing ${entries.length} / ${total} algorithms`;
      element("board-title").textContent = board.benchmark.title;
      element("dataset-revision").textContent = String(board.benchmark.dataset_revision ?? "Unknown").slice(0, 12);
      element("dataset-revision").title = board.benchmark.dataset_revision ?? "";
      element("table-caption").textContent = `${board.benchmark.title} service-level root cause analysis results`;
      element("sort-description").textContent = SORT_COLUMNS.find(column => column.key === state.sortKey).description;
      document.querySelectorAll("#benchmark-tabs button").forEach((tab, index) => {
        const selected = tab.dataset.id === state.boardId;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
        if (selected) table.setAttribute("aria-labelledby", `benchmark-tab-${index}`);
      });
      document.querySelectorAll("#leaderboard-head th[data-column]").forEach(heading => {
        const active = heading.dataset.column === state.sortKey;
        heading.classList.toggle("active-sort", active);
        heading.setAttribute("aria-sort", active ? (ascending ? "ascending" : "descending") : "none");
        heading.querySelector("span").textContent = active ? (ascending ? "↑" : "↓") : "";
      });
      body.innerHTML = entries.length ? entries.map((entry, index) => renderRow(entry, index, board, state.sortKey)).join("")
        : `<tr><td colspan="11" class="empty-state"><strong>${total ? "No matching algorithms" : "No published results for this dataset yet"}</strong><br>${total ? "Try another search or reset the filters." : "Results will appear here after evaluation and quality checks."}</td></tr>`;
    },

    error(message) {
      filters.disabled = true;
      table.setAttribute("aria-busy", "false");
      element("result-count").textContent = "Unable to load results";
      element("error-message").textContent = message;
      element("load-error").hidden = false;
      body.innerHTML = '<tr><td colspan="11" class="empty-state">The leaderboard is temporarily unavailable. Please retry.</td></tr>';
    },
  };
}
