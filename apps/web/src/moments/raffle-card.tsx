import type { MomentView } from "./api";
import { Pixel } from "./pixel-art";
import "./raffle-card.css";

type Raffle = NonNullable<MomentView["raffle"]>;
const conditions: Record<Raffle["condition"], string> = { like: "点赞参与", comment: "评论参与", both: "点赞＋评论参与" };

function deadline(at: number): { label: string; dateTime?: string } {
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) return { label: `开奖时间戳 ${at} 毫秒` };
  const fields = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map(part => [part.type, part.value]));
  const seconds = at % 60_000 === 0 ? "" : `:${fields.second}${at % 1000 ? `.${String(at % 1000).padStart(3, "0")}` : ""}`;
  return { label: `北京时间 ${fields.year}-${fields.month}-${fields.day} ${fields.hour}:${fields.minute}${seconds}`, dateTime: date.toISOString() };
}

function result(prize: Raffle["prizes"][number]): string {
  if (prize.action === "award") return `${prize.winnerName ?? "中奖家庭"} · ${prize.settledAt === null ? "到账待确认" : "已到账"}`;
  if (prize.action === "return") return `未分配 · ${prize.settledAt === null ? "退回待确认" : "已退回"}`;
  return "结果待确认";
}

export function RaffleCard({ raffle }: { raffle: Raffle }) {
  const status = raffle.state === "open" ? "进行中" : raffle.prizes.some(prize => prize.settledAt === null) ? "开奖中" : "已开奖";
  const time = deadline(raffle.at);
  return <section className="source raffle-ticket" aria-label="邻里抽奖">
    <div className="raffle-title"><span>▧ 邻里抽奖</span><span>{status}</span></div>
    <div className="raffle-items">{raffle.prizes.map((prize, index) => <div className="raffle-prize" key={index}>
      <Pixel kind={prize.item.kind === "dish" ? "meal" : "bait"} size={32} />
      <div><strong>{prize.item.name} × {prize.item.quantity}</strong>{raffle.state === "drawn" && <small>{result(prize)}</small>}</div>
    </div>)}</div>
    <div className="raffle-bottom"><span>{conditions[raffle.condition]}</span><time dateTime={time.dateTime}>截止：{time.label}</time></div>
  </section>;
}
