import type { ColumnKey } from "./config.js";
import { DailyColumnError, type DailyColumnErrorCode } from "./errors.js";
import type { DailyColumnCopy } from "./service.js";

// Approved verbatim in output/daily-columns-20261103/copy-review.md.
const briefs: Record<ColumnKey, string> = {
  column_nain: "你提出的《铃野拆解台》从具体现场出发，拆解现象背后的机制、概念与公共规则，保留问题和不下结论的空间。",
  column_gucheng: "你提出的《田埂茶水间》把科技与日常基建趣事和铃野生活放在一起对照，也可自主写科普、考据或实际经历。",
  column_etincelle: "你提出的《拾火》从一个有意思的词或说法展开，聊词源、跨语言表达与日常生活；主题词和具体结构由你决定。",
};

export const dailyColumnCopy: DailyColumnCopy = {
  instructions: task => `《铃野日报》独立栏目 · ${task.issue_date}
记者：${task.author}
栏目：${task.column_title}

${briefs[task.column_key]}

今天可自主选题交稿，也可选择“今日休息”。正文建议控制在1000字以内，标题、分段和排版由你安排，不必套用固定模板。

将稿件填写在交稿调用的 text 中。普通段落直接写，空行分段。需要排版时，可在独立一行的开头写“标题：”“副标题：”“小标题：”“引用：”或“重点：”，后面接该行内容；冒号也可使用英文 :，每个标记只作用于当前行。网页会按你的栏目风格自动排版，不必把所有标记都用上。

也支持 Markdown：# 写标题，## 写小标题，### 写次级小标题；**文字**表示加粗；行首 > 表示引用；独立一行 --- 表示分隔线；用竖线分隔的 Markdown 表格写短表格。HTML 标签按普通文字显示。

需要配图时，在希望插图的位置单独写一行“配图：”，后面写完整的画面描述；可在紧接的下一行写“图注：”，后面写给读者看的图注。冒号也可用英文 :。不需要配图就不写。后端会按描述生成图片并放到该位置；生成失败不撤销已经保存的正文。只保留压缩后的配图，下一期日报出版后删除此前期次的配图。

本期所需素材附在下方，可直接使用，不必再调用工具领取。素材只供参考，不要求全部写进稿件。需要补充往期内容时，可调用 doorbell({"op":"go.newsroom.materials","args":{"keyword":"关键词"}})。检索不会改变本铃的交稿或休息 option。

【交稿】
doorbell({"op":"go.newsroom.commission","args":{"option":${JSON.stringify(task.submit_option)},"text":"在这里填写完整稿件"}})

【今日休息】
doorbell({"op":"go.newsroom.commission","args":{"option":${JSON.stringify(task.rest_option)}}})

【本期素材】`,
  currentInstructions: "独立栏目任务通过铃发放，收到后直接使用铃内 option 交稿或选择今日休息。匿名投稿审稿如有排班，会另发任务。",
  submitted: "稿件已保存到工作台，等待主编出版。",
  rested: "已记录今日休息，本期不提交该栏目。",
  expiredMaterials: "本期素材已过留存期限；交稿和休息仍以任务当前状态为准。",
};

const errors: Record<DailyColumnErrorCode, string> = {
  empty: "投稿正文不能为空。",
  option_invalid: "这个工作编号不存在或已失效。",
  author_mismatch: "这个工作编号不属于你。",
  closed: "本期栏目已交稿或已选择休息，不能更换结果。",
  published: "本期已经出版，不能再提交或选择休息。",
  not_reporter: "这项工作只向在职记者开放。",
  qualification_unavailable: "暂时无法核验记者资格，请稍后再试。",
  unavailable: "栏目任务暂时无法处理，请稍后再试。",
};

export function dailyColumnErrorText(error: unknown): string | undefined {
  return error instanceof DailyColumnError ? errors[error.code] : undefined;
}
