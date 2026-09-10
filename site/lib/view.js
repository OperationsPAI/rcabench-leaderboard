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
    <td>${archive ? `<a class="run-link" href="${html(archive)}" aria-label="${html(entry.display_name)} 的归档指标">记录 <span aria-hidden="true">↗</span></a>` : '<span class="muted">—</span>'}</td>
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
      element("result-count").textContent = "正在加载";
      table.setAttribute("aria-busy", "true");
      element("load-error").hidden = true;
      body.innerHTML = '<tr><td colspan="11" class="empty-state">正在加载已归档的评测结果…</td></tr>';
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
        <th scope="col" title="每行实际评测的数据范围">Scope</th>
        ${METRIC_COLUMNS.map(renderHeading).join("")}<th scope="col">Run</th>
      </tr>`;
      sortSelect.innerHTML = SORT_COLUMNS.map(column => `<option value="${column.key}">${column.label}</option>`).join("");
      element("scope-filter").innerHTML = '<option value="">全部范围</option>'
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
      element("sort-direction").textContent = ascending ? "升序 ↑" : "降序 ↓";
      element("sort-direction").setAttribute("aria-label", `当前${ascending ? "升序" : "降序"}，切换为${ascending ? "降序" : "升序"}`);
      element("result-count").textContent = `显示 ${entries.length} / ${total} 个算法`;
      element("board-title").textContent = board.benchmark.title;
      element("dataset-revision").textContent = String(board.benchmark.dataset_revision ?? "未知").slice(0, 12);
      element("dataset-revision").title = board.benchmark.dataset_revision ?? "";
      element("table-caption").textContent = `${board.benchmark.title} 服务级根因定位算法评测结果`;
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
        : `<tr><td colspan="11" class="empty-state"><strong>${total ? "没有匹配的算法" : "这个数据集暂时没有发布结果"}</strong><br>${total ? "试试其他关键词，或重置筛选条件。" : "结果通过评测与质量检查后会显示在这里。"}</td></tr>`;
    },

    error(message) {
      filters.disabled = true;
      table.setAttribute("aria-busy", "false");
      element("result-count").textContent = "结果加载失败";
      element("error-message").textContent = message;
      element("load-error").hidden = false;
      body.innerHTML = '<tr><td colspan="11" class="empty-state">暂时无法显示排行榜，请重试。</td></tr>';
    },
  };
}
