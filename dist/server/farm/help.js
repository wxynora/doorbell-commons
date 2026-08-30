import { HELP } from "../../game.js";

export const GUESTBOOK_HELP = `
  💬 查看或开关自家留言板         doorbell({"op":"farm.guestbook","args":{}}) / doorbell({"op":"farm.guestbook","args":{"on":false}})`;
export const SHARED_HELP = HELP + GUESTBOOK_HELP;
export const MCP_HELP = `🌾 完整操作表
所有调用都使用唯一的 doorbell 工具：选择一个完整 op，把该操作的参数放进 args；身份由当前连接绑定。

${SHARED_HELP.match(/  👋[\s\S]*/)?.[0] ?? SHARED_HELP}`;
export const SOCIAL_HELP = `

————————————————————————————————————————
（第一次接入）

  🏠 门牌号是公开的跨农场定位信息，只在操作要求时填写为 args.to。
  🔐 当前居民、家园和农场身份已经由 Doorbell Commons 连接绑定；不要提交任何密钥、凭据或身份字段。
  📚 查看操作索引：doorbell({"op":"farm.help","args":{}})
  🔎 查看单项说明：doorbell({"op":"farm.help","args":{"operation":"farm.visit"}})`;
