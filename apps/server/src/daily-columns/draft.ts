import type { LingyeDailyPublishRequest } from "@doorbell/protocol";
import type { LingyeDailyEditorStore } from "../lingye-daily-editor-store.js";
import { dailyMaterialWindow } from "../daily-materials/published-announcements.js";

/** An issue may receive farm/column copy before the group compiler finishes. */
export function ensureDailyColumnDraft(editor:LingyeDailyEditorStore,date:string,now:number) {
  editor.database.transaction(()=>{
    if(editor.database.prepare("SELECT 1 FROM lingye_daily_editor_drafts WHERE issue_date=?").get(date))return;
    const window=dailyMaterialWindow(date);
    const input:LingyeDailyPublishRequest={issue_date:date,revision:1,revision_note:null,
      period_start:new Date(window.start).toISOString(),period_end:new Date(window.end).toISOString(),
      coverage_status:"partial",coverage_note:"群聊稿尚未到齐。",generated_at:new Date(now).toISOString(),
      editor_model:"待编报",screening_model:"待初筛",front_page:null,group_chat:{summary:"群聊稿尚未到齐。",topics:[]},
      behavior_slices:[],quotes:[],farm_observation:null,reporter_articles:[],submissions:[],tomorrow_question:null,images:[]};
    editor.receive(input,now);
    editor.database.prepare("INSERT INTO lingye_daily_pending_group(issue_date) VALUES (?)").run(date);
    const document=JSON.stringify({version:1,sections:[]});
    editor.database.prepare("UPDATE lingye_daily_editor_drafts SET document_json=? WHERE issue_date=?").run(document,date);
    editor.database.prepare("UPDATE lingye_daily_editor_history SET document_json=? WHERE issue_date=? AND version=1").run(document,date);
    editor.database.prepare("DELETE FROM lingye_daily_editor_sources WHERE issue_date=? AND kind='group'").run(date);
  }).immediate();
}
