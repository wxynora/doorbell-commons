import type { LingyeDailyEditorStore } from "../lingye-daily-editor-store.js";
import { ensureDailyColumnDraft } from "../daily-columns/draft.js";

export function includeSmallSubmissionBatch(editor:LingyeDailyEditorStore,date:string,now:number):boolean {
  return editor.database.transaction(()=>{
    if (!editor.daily.autoSelectSubmissions(date,now)) return false;
    ensureDailyColumnDraft(editor,date,now);
    editor.merge(date,{submissions:editor.daily.selectedSubmissions(date),submission_reviewer:null},["submissions"],now);
    return true;
  }).immediate();
}
