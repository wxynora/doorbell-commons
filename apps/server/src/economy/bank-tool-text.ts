type Fact = Record<string, unknown>;
type BankSuccess = { text: string; data: Fact };
type Helpers = {
  renderOptions: (op: string, data: Fact) => string[];
  resultMessage: (text: unknown, fallback: string) => string;
  publicFarmText: (value: unknown) => string | undefined;
};

const isRecord = (value: unknown): value is Fact => typeof value === "object" && value !== null && !Array.isArray(value);
const rows = (value: unknown): Fact[] => Array.isArray(value) ? value.filter(isRecord) : [];
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("zh-CN") : "暂无法读取";
const percent = (value: unknown, fixed = false) => typeof value === "number" && Number.isFinite(value)
  ? `${fixed ? (value / 10000).toFixed(2) : value / 10000}%` : "暂无法读取";
const date = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "暂无法读取";
const status = (value: unknown) => ({active: "履行中", overdue: "已逾期", restricted: "高消费受限", repaid: "已还清", proposed: "等待双方确认", cancelled: "已取消"})[String(value) as "active"] ?? "暂无法读取";

function part(data: Fact, key: string): unknown {
  if (isRecord(data.current) && data.current[key] !== undefined) return data.current[key];
  return data.section === key ? data.value : data[key];
}

function accountText(value: unknown): string[] {
  if (!isRecord(value)) return [];
  return [`余额：可用金币 ${number(value.availableGold)}，金币活期 ${number(value.demandGold)}，金币定期 ${number(value.termGold)}；可用银币 ${number(value.availableSilver)}，小机可自主使用 ${number(value.agentSpendableSilver)}，已锁定 ${number(value.silverAgentLock)}。`];
}

function depositText(value: Fact, index: number): string {
  if (value.state === "matured" || value.state === "terminated")
    return `定期存款 ${index + 1}：本金 ${number(value.principal)} 金币，实际到账利息 ${number(value.interestPaid)} 金币，本息合计 ${number(value.paidTotal)} 金币。状态：${value.state === "matured" ? "已到期返还" : "已提前终止"}。`;
  return `定期存款 ${index + 1}：本金 ${number(value.principal)} 金币，存期 ${number(value.termDays)} 天，整期总利率 ${percent(value.totalRatePpm)}。预计到期利息 ${number(value.expectedInterest)} 金币，本息合计 ${number(value.expectedTotal)} 金币；到期日期 ${date(value.maturityDate)}（北京时间）。状态：存续中。`;
}

function loanText(value: Fact, index: number, player: boolean, helpers: Helpers): string {
  const currency = player ? "银币" : "金币";
  const who = helpers.publicFarmText(value.counterparty) ?? "对方公开农场暂无法读取";
  const direction = value.role === "lender" ? `出借给${who}` : `向${who}借入`;
  if (player && value.status === "cancelled") return `玩家借款提案 ${index + 1}：已取消，未放款。`;
  if (player && value.status === "proposed") {
    const own = value.role === "lender" ? value.lenderConfirmedAt : value.borrowerConfirmedAt;
    const other = value.role === "lender" ? value.borrowerConfirmedAt : value.lenderConfirmedAt;
    return `玩家借款提案 ${index + 1}：${direction} ${number(value.principalOriginal)} 银币，期限 ${number(value.termDays)} 天，整期总利率 ${percent(value.totalRatePpm)}。若全期不提前还款，预计利息 ${number(value.fullTermInterest)} 银币、本息合计 ${number(value.fullTermTotal)} 银币。${own == null ? "本人待确认" : "本人已确认"}，${other == null ? "对方待确认" : "对方已确认"}；尚未放款，尚未产生利息。`;
  }
  const opening = player
    ? `玩家借款 ${index + 1}：${direction} ${number(value.principalOriginal)} 银币，期限 ${number(value.termDays)} 天，整期总利率 ${percent(value.totalRatePpm)}。`
    : `系统贷款 ${index + 1}：借入本金 ${number(value.principalOriginal)} 金币，期限 ${number(value.termDays)} 天，日利率 ${percent(value.dailyRatePpm)}。`;
  return `${opening}当前未还本金 ${number(value.principalOutstanding)}，截至北京时间 ${date(value.asOfDate)} 的利息 ${number(value.payoffInterest)}，当前结清共需 ${number(value.payoffAmount)} ${currency}；到期日期 ${date(value.dueDate)}。状态：${status(value.status)}。`;
}

function rateText(data: Fact): string[] {
  if (!isRecord(data.rates)) return [];
  const rates = data.rates;
  const section = data.section;
  const lines: string[] = [];
  if (section === undefined || section === "deposits") {
    lines.push(`金币活期：日利率 ${percent(rates.demandDailyRatePpm)}，按北京时间当天最低活期本金计息，次日 00:05 发到可用金币。利息向下取整，不足 1 金币的部分不结转。本金可随时取出。`);
    const terms = rows(rates.termDeposits).map(term => `${number(term.termDays)} 天总利率 ${percent(term.minimumTotalRatePpm, true)}～${percent(term.maximumTotalRatePpm, true)}`);
    lines.push(`金币定存：最低 ${number(rates.termDepositMinimumGold)} 金币。${terms.join("；")}。这是整段存期的总利率。到期返还本金和利息，不自动续存；提前只能整份取回，本金全退、利息为 0。`);
    lines.push("银币锁定不计息，也不转走银币；只限制小机自主消费。小机只能增加锁定，解除锁定由人类办理。");
  }
  if (section === undefined || section === "loans") {
    const terms = rows(rates.systemLoans).map(term => `${number(term.termDays)} 天日利率 ${percent(term.dailyRatePpm, true)}`);
    lines.push(`系统金币贷款：${terms.join("；")}。按未还本金逐日计单利，先还利息再还本金；可部分还款或提前结清。到期后不再增加合同利息，银行不自动扣款。`);
    if (isRecord(rates.playerLoans)) lines.push(`玩家银币借款：期限 ${number(rates.playerLoans.minimumTermDays)}～${number(rates.playerLoans.maximumTermDays)} 天，双方约定整期总利率 0%～${percent(rates.playerLoans.maximumTotalRatePpm)}。双方都确认后才放款；按未还本金逐日计单利，可提前还款，先还利息再还本金。到期后不再增加合同利息，银行不自动扣款。`);
  }
  return lines;
}

function operationText(data: Fact, helpers: Helpers): string[] {
  if (!isRecord(data.receipt)) return [];
  const r = data.receipt;
  const contract = isRecord(r.contract) ? r.contract : undefined;
  const account = part(data, "account");
  const balance = isRecord(account) ? account : {};
  const index = Number.isSafeInteger(r.contractIndex) ? r.contractIndex as number : 0;
  const currency = r.currency === "silver" ? "银币" : "金币";
  const lines: string[] = [];
  if (r.replayed === true) lines.push("这是该笔业务的原回执，本次没有再次扣款或发款。");
  switch (r.action) {
    case "demand-deposit":
      lines.push(`已存入金币活期 ${number(r.amount)} 金币。当前活期本金 ${number(balance.demandGold)} 金币，可用金币 ${number(balance.availableGold)}。`); break;
    case "demand-withdraw":
      lines.push(`已取出金币活期 ${number(r.amount)} 金币。当前活期本金 ${number(balance.demandGold)} 金币，可用金币 ${number(balance.availableGold)}。`); break;
    case "term-open":
      if (r.replayed === true && contract) { lines.push(depositText(contract, index)); break; }
      if (contract) lines.push(`已办理金币定存。本次存入 ${number(contract.principal)} 金币；${depositText(contract, index)}`); break;
    case "term-close":
      if (contract?.state === "terminated") lines.push(`已提前取回整份定存：本金 ${number(contract.principal)} 金币，利息 0 金币，合计到账 ${number(contract.principal)} 金币。`);
      else if (contract?.state === "matured") lines.push(`定存已到期返还：本金 ${number(contract.principal)} 金币，利息 ${number(contract.interestPaid)} 金币，合计到账 ${number(contract.paidTotal)} 金币。`);
      break;
    case "exchange-gold-silver":
      if (isRecord(r.exchange)) lines.push(`兑换完成：兑换本金 ${number(r.exchange.goldPrincipal)} 金币，手续费 ${number(r.exchange.goldFee)} 金币，实际共扣 ${number(r.exchange.goldTotal)} 金币，到账 ${number(r.exchange.silverReceived)} 银币。`); break;
    case "system-loan-open":
      if (contract) lines.push(`系统贷款已放款，到账 ${number(contract.principalOriginal)} 金币。${loanText(contract, index, false, helpers)}`); break;
    case "system-loan-repay":
    case "player-loan-repay":
      if (contract && isRecord(r.repayment)) lines.push(`本次已还 ${number(r.repayment.amount)} ${currency}，其中利息 ${number(r.repayment.interestPaid)}、本金 ${number(r.repayment.principalPaid)}；当前剩余本金 ${number(contract.principalOutstanding)}、利息 ${number(contract.payoffInterest)}，当前结清还需 ${number(contract.payoffAmount)} ${currency}。`);
      if (contract?.status === "repaid") lines.push("这笔贷款已还清。");
      break;
    case "silver-lock-increase":
      lines.push(`已将小机银币锁定额设为 ${number(r.lockAmount)} 银币。${typeof r.lockIncrease === "number" ? `本次增加 ${number(r.lockIncrease)} 银币，` : ""}当前小机可自主使用 ${number(balance.agentSpendableSilver)} 银币；没有转走银币，也不产生利息。`); break;
    case "player-loan-offer":
    case "player-loan-request":
      if (r.replayed === true && contract) { lines.push(loanText(contract, index, true, helpers)); break; }
      if (contract) lines.push(`借款提案已提交，尚未放款。${loanText(contract, index, true, helpers)}`); break;
    case "player-loan-confirm":
      if (r.replayed === true && contract) { lines.push(loanText(contract, index, true, helpers)); break; }
      if (r.operationState === "proposed") lines.push("本人已确认借款合同，等待对方确认；尚未放款。");
      else if (contract) lines.push(`双方已确认借款合同，${contract.role === "lender" ? "出借扣款" : "借入到账"} ${number(contract.principalOriginal)} 银币。${loanText(contract, index, true, helpers)}`);
      break;
    case "player-loan-cancel":
      lines.push("借款提案已取消，未放款。"); break;
  }
  return lines;
}

export function renderBankToolText(op: string, result: BankSuccess, helpers: Helpers): string {
  const data = result.data;
  const lines = ["🏦 铃野银行", helpers.resultMessage(result.text, "已读取铃野银行当前事实。")];
  if (op === "go.bank.choose") lines.push(...operationText(data, helpers));
  lines.push(...accountText(part(data, "account")));
  if (op === "go.bank.view") {
    lines.push(...rateText(data));
    const deposits = part(data, "deposits");
    if (isRecord(deposits)) {
      lines.push(`存款：金币活期 ${number(deposits.demandGold)}。`);
      const terms = rows(deposits.termDeposits);
      lines.push(terms.length ? "定期存款：" : "定期存款：无。", ...terms.map(depositText));
    }
    const exchange = part(data, "exchange");
    if (isRecord(exchange)) lines.push(`金币兑换银币：${number(exchange.goldPerSilver)} 金币本金换 1 银币，另收金币手续费。本月累计兑换的前 300 银币按本金的 5% 收费，第 301～700 银币按 10%，第 701～1,000 银币按 20%；跨档分别计算。个人本月剩余额度 ${number(exchange.residentRemainingThisMonth)} 银币，全服剩余 ${number(exchange.globalRemainingThisMonth)} 银币。`);
    const loans = part(data, "loans");
    if (isRecord(loans)) {
      const system = rows(loans.systemLoans), player = rows(loans.playerLoans);
      lines.push("贷款：", ...(system.length ? system.map((value, i) => loanText(value, i, false, helpers)) : ["系统贷款：无。"]),
        ...(player.length ? player.map((value, i) => loanText(value, i, true, helpers)) : ["玩家借款：无。"]));
    }
  }
  const credit = part(data, "credit");
  if (isRecord(credit)) lines.push(`信用：${number(credit.creditPoints)} 点；系统贷款额度 ${number(credit.systemLoanLimitGold)} 金币；高消费限制：${credit.highSpendRestricted === true ? "有" : credit.highSpendRestricted === false ? "无" : "暂无法读取"}。`);
  if (isRecord(data.reference) && isRecord(data.reference.value)) {
    const ref = data.reference;
    if (ref.type === "term_deposit") lines.push(depositText(ref.value as Fact, 0));
    if (ref.type === "system_loan" || ref.type === "player_loan") lines.push(loanText(ref.value as Fact, 0, ref.type === "player_loan", helpers));
  }
  return [...lines, ...helpers.renderOptions("go.bank.choose", data)].join("\n");
}
