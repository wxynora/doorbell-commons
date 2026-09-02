import type { ReporterRelayWake } from "@doorbell/protocol";

const materialCategoryLabels: Record<
  Extract<ReporterRelayWake, { stage: "selection" }>["materials"][number]["category"],
  string
> = {
  today_board: "今日榜",
  weather_forecast: "天气预告",
  lingye_together: "铃野共行",
  security_detention: "看守所",
};

type ReporterRelayMaterial = Extract<
  ReporterRelayWake,
  { stage: "selection" }
>["materials"][number];

function materialsText(materials: ReporterRelayMaterial[]): string {
  return materials
    .map(
      (material, index) => `素材 ${index + 1}｜${materialCategoryLabels[material.category] ?? material.title}
发生时间：${material.occurred_at}
标题：${material.title}
内容：
${material.content}`,
    )
    .join("\n\n");
}

function actionCall(
  action: { op: "go.newsroom.commission"; args: { option: string } },
  text?: string,
) {
  return `doorbell(${JSON.stringify({
    op: action.op,
    args: {
      option: action.args.option,
      ...(text === undefined ? {} : { text }),
    },
  })})`;
}

export function renderReporterRelayWake(wake: ReporterRelayWake): string {
  switch (wake.stage) {
    case "selection": {
      const materials = materialsText(wake.materials);
      return `【铃野日报社·今日选题】

今天你负责本期《铃野日报》的选题。以下是本期全部可用的公开素材：

${materials}

筛选本期素材，提出几个和素材相关的有趣话题，每个话题标明对应的素材编号即可。
话题：……；素材编号：1、3

无需先查看日报社工作，直接调用：

${actionCall(wake.action, "你的选题结果")}

只能依据以上素材，不要补充素材中没有的事实。`;
    }
    case "writing":
      return `【铃野日报社·今日撰稿】

从选题记者提出的话题中，选两个你觉得值得写的，写成有趣、有观察感的农场日常观测；别只整理数据，也别编造事实。

请根据选题记者处理后的选题结果写成可直接刊登的报道原稿。无需先查看日报社工作，直接调用：

${actionCall(wake.action, "你的报道原稿")}

选题记者已经完成选题：

${wake.selection_text}`;
    case "review": {
      const approve = actionCall(wake.actions.approve);
      const reject = actionCall(wake.actions.reject, "退稿原因");
      const materials = materialsText(wake.materials);
      if (wake.actions.supplement) {
        return `【铃野日报社·今日审稿】

请核对事实、来源、隐私和格式，并从下面三种结果中选择一种：

通过并刊登：
${approve}

退回补充：
${actionCall(wake.actions.supplement, "需要补充或修改的具体内容")}

退稿：
${reject}

本期原始公开素材：

${materials}

撰稿记者已经提交原稿：

${wake.article_text}`;
      }
      return `【铃野日报社·补充稿复审】

本期已经使用过一次退回补充，请核对事实、来源、隐私和格式，并从下面两种结果中选择一种：

通过并刊登：
${approve}

退稿：
${reject}

本期原始公开素材：

${materials}

上次审稿意见：

${wake.review_feedback}

撰稿记者已经提交补充后的原稿：

${wake.article_text}`;
    }
    case "supplement": {
      return `【铃野日报社·原稿退回补充】

写得像一篇有看点的报道，别只罗列排名和数字；语言自然生动，可以轻轻吐槽，但别编造素材之外的情节。

请按审稿意见补充后重新提交。无需先查看日报社工作，直接调用：

${actionCall(wake.action, "补充后的完整报道原稿")}

审稿记者的具体意见：

${wake.review_feedback}

你上次提交的原稿：

${wake.article_text}`;
    }
  }
}

export const reporterRelayRenderer = { render: renderReporterRelayWake };
