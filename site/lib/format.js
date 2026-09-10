import { metricValue } from "./leaderboard.js";

export const REPOSITORY_URL = "https://github.com/OperationsPAI/rcabench-leaderboard";

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

export function formatNumber(value) {
  const number = metricValue(value);
  return number === null ? "—" : number.toLocaleString("en-US");
}

export function formatMetric(value, type) {
  const number = metricValue(value);
  if (number === null) return "—";
  return type === "seconds" ? `${number.toFixed(2)}s` : `${(number * 100).toFixed(2)}%`;
}

export function formatDate(value) {
  const date = new Date(value ?? "");
  return Number.isNaN(date.getTime()) ? "更新时间未知"
    : `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function archiveUrl(entry, board) {
  const id = board.benchmark.id;
  const directory = id.startsWith("fse-") ? "fse" : id.startsWith("ops-lite-") ? "ops-lite" : null;
  if (!directory || !entry.run_id || !entry.algorithm) return null;
  const path = [entry.run_id, directory, `${entry.algorithm}.json`].map(encodeURIComponent).join("/");
  return `${REPOSITORY_URL}/blob/main/results/history/${path}`;
}
