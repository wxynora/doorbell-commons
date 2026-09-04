import React from "react";

export function DailyEditorDuty({name}:{name:string|null}) {
  return name ? <p className="daily-editor-duty">今日已当值主编：<strong>{name}</strong></p> : null;
}
