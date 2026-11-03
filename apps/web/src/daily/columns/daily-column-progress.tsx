import React from "react";
import type { LingyeDailyColumnProgress } from "./protocol.js";
import "./daily-columns.css";

export function DailyColumnProgressList({ columns }: {
  columns: readonly LingyeDailyColumnProgress[];
}) {
  if (!columns.length) return null;
  return <div className="daily-column-progress" role="list" aria-label="记者独立栏目进度">
    {columns.map(column => <p className="daily-column-progress-row" role="listitem"
      data-column-key={column.columnKey} data-status={column.status} key={column.columnKey}>
      <strong>{column.title}</strong><br />{column.reporterName} · {column.label}
    </p>)}
  </div>;
}
