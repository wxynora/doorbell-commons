import { z } from "zod";

export interface DoorbellCallExample {
  op: string;
  args: Record<string, unknown>;
}

export type FarmOperationPlan =
  | { kind: "help"; operation?: string }
  | { kind: "farm"; action: string; params: Record<string, unknown> };

export interface FarmOperationDefinition {
  op: string;
  description: string;
  argsHint: string;
  argsSchema: z.ZodType<Record<string, unknown>>;
  examples: readonly DoorbellCallExample[];
  adapt(args: Record<string, unknown>): FarmOperationPlan;
}

type ArgsShape = Record<string, z.ZodType>;

interface OperationConfig {
  op: string;
  description: string;
  argsHint: string;
  branches: readonly ArgsShape[];
  exampleArgs: readonly Record<string, unknown>[];
  adapt(args: Record<string, unknown>): FarmOperationPlan;
  supportsDetail?: boolean;
}

const nonEmptyString = z.string().trim().min(1);
const positiveInteger = z.number().int().positive();
const uniquePositiveIntegers = z
  .array(positiveInteger)
  .min(1)
  .refine((values) => new Set(values).size === values.length, "地块编号不能重复");
const animalName = nonEmptyString.refine((value) => !/^\d+$/.test(value), "动物名称不能是数字代号");
const integer = z.number().int();
const nonEmptyStrings = z.array(nonEmptyString);
const kitchenItems = z.array(nonEmptyString).min(2).max(5);
const kitchenResearchItems = z.array(nonEmptyString).min(2).max(5);
const kitchenMethod = z.enum([
  "stir-fry",
  "pan-fry",
  "stew",
  "steam",
  "roast",
  "deep-fry",
  "dessert",
  "drink",
]);

function createArgsSchema(
  branches: readonly ArgsShape[],
  supportsDetail: boolean,
): z.ZodType<Record<string, unknown>> {
  const schemas = branches.map((branch) =>
    z.strictObject({
      ...branch,
      ...(supportsDetail ? { detail: z.boolean().optional() } : {}),
    }),
  );
  if (schemas.length === 1) {
    return schemas[0] as z.ZodType<Record<string, unknown>>;
  }
  const first = schemas[0];
  const second = schemas[1];
  if (!first || !second) {
    throw new Error("A farm operation must define at least one args branch");
  }
  return z.union([first, second, ...schemas.slice(2)]) as z.ZodType<Record<string, unknown>>;
}

function defineOperation(config: OperationConfig): FarmOperationDefinition {
  return {
    op: config.op,
    description: config.description,
    argsHint: config.argsHint,
    argsSchema: createArgsSchema(config.branches, config.supportsDetail !== false),
    examples: config.exampleArgs.map((args) => ({ op: config.op, args })),
    adapt: config.adapt,
  };
}

function direct(
  op: string,
  description: string,
  argsHint: string,
  action: string,
  shape: ArgsShape = {},
  exampleArgs: readonly Record<string, unknown>[] = [{}],
): FarmOperationDefinition {
  return defineOperation({
    op,
    description,
    argsHint: argsHint === "{}" ? "{detail?}" : argsHint,
    branches: [shape],
    exampleArgs,
    adapt: (args) => ({ kind: "farm", action, params: args }),
  });
}

const runPlantSchema = z
  .strictObject({
    common: integer.optional(),
    fantasy: integer.optional(),
    limited: nonEmptyStrings.optional(),
  })
  .optional();

const nonHelpOperations: FarmOperationDefinition[] = [
  direct("farm.status", "查看并刷新当前农场状态、可做事项和实时公告。", "{}", "status"),
  direct("farm.shop", "查看自己商店当前在售的种子、物品、限定货物和隐藏配方。", "{}", "shop"),
  direct("farm.bag", "查看素材、限定种子、已学配方和熔炼提示。", "{}", "bag"),
  direct("farm.market", "查看自己摊位当前上架的商品。", "{}", "market"),
  direct(
    "farm.encyclopedia",
    "查看图鉴进度；提供 id 时查看指定作物或素材详情。",
    "{id?, detail?}",
    "encyclopedia",
    { id: nonEmptyString.optional() },
    [{}, { id: "crop-id" }],
  ),
  direct("farm.ledger", "查看主农场与人类牧场相关的金币、动物购买和药水往来记录。", "{}", "ledger"),
  direct("farm.leaderboard", "查看全服总榜和今日榜。", "{}", "leaderboard"),
  defineOperation({
    op: "farm.plant",
    description: "播种作物：批量按种类播种，或在指定地块播种；两种形式二选一。",
    argsHint: "{common?, fantasy?, limited?, detail?} 或 {plotId, seedType?, limitedId?, detail?}",
    branches: [
      {
        common: positiveInteger.optional(),
        fantasy: positiveInteger.optional(),
        limited: nonEmptyStrings.optional(),
      },
      {
        plotId: positiveInteger,
        seedType: nonEmptyString.optional(),
        limitedId: nonEmptyString.optional(),
      },
    ],
    exampleArgs: [
      { common: 3, fantasy: 3 },
      { limited: ["limited-seed-id"] },
      { plotId: 1, seedType: "common" },
    ],
    adapt: (args) => ({ kind: "farm", action: "plant", params: args }),
  }),
  direct(
    "farm.water",
    "给自己的作物浇水；提供 to 时为指定农场浇水，plotId 可指定地块。",
    "{to?, plotId?, detail?}",
    "water",
    { to: nonEmptyString.optional(), plotId: positiveInteger.optional() },
    [{}, { to: "6" }, { to: "6", plotId: 1 }],
  ),
  defineOperation({
    op: "farm.ripen",
    description:
      "使用加速药水催熟；plots 精确指定地块，auto:true 按现有金币和商店当日限购自动补药并尽量催熟全部生长地块。",
    argsHint: "{plots, detail?} 或 {auto:true, detail?}",
    branches: [{ plots: uniquePositiveIntegers }, { auto: z.literal(true) }],
    exampleArgs: [{ plots: [1] }, { plots: [1, 3, 5] }, { auto: true }],
    adapt: (args) => ({ kind: "farm", action: "ripen", params: args }),
  }),
  direct(
    "farm.harvest",
    "收获指定地块；不提供 plotId 时收获全部成熟作物，compact 控制批量结果的展开方式。",
    "{plotId?, compact?, detail?}",
    "harvest",
    { plotId: positiveInteger.optional(), compact: z.boolean().optional() },
    [{}, { plotId: 1 }, { compact: true }],
  ),
  defineOperation({
    op: "farm.run",
    description:
      "按一次调用完成可选的收旧作物、播种、浇水和收获步骤；未填写 water 或 harvest 时沿用当前一条龙默认执行。",
    argsHint: "{plant?, water?, harvestFirst?, harvest?, compact?, detail?}",
    branches: [
      {
        plant: runPlantSchema,
        water: z.union([z.boolean(), z.literal("if-any")]).optional(),
        harvestFirst: z.boolean().optional(),
        harvest: z.union([z.boolean(), z.literal("if-any")]).optional(),
        compact: z.boolean().optional(),
      },
    ],
    exampleArgs: [{ plant: { common: 3, fantasy: 3 } }],
    adapt: (args) => ({
      kind: "farm",
      action: "run",
      params: {
        ...args,
        water: args.water ?? true,
        harvest: args.harvest ?? true,
      },
    }),
  }),
  direct("farm.upgrade-land", "将自己的土地升级到下一等级。", "{}", "upgrade-land"),
  defineOperation({
    op: "farm.buy",
    description: "购买商品；可从商店、NPC 或其他农场摊位购买，具体来源和商品类型由参数指定。",
    argsHint:
      '{source:"shop", kind:"recipe"|"seed"|"item", ...}、{source:"farm-shop", kind:"potion-set", ...}、{source:"npc", id} 或 {source:"market", to, kind, id, qty?}',
    branches: [
      { source: z.literal("shop"), kind: z.literal("recipe") },
      { source: z.literal("shop"), kind: z.literal("seed"), id: nonEmptyString.optional() },
      {
        source: z.literal("shop"),
        kind: z.literal("item"),
        id: nonEmptyString,
        qty: positiveInteger.optional(),
      },
      {
        source: z.literal("farm-shop"),
        kind: z.literal("potion-set"),
        to: nonEmptyString.optional(),
      },
      { source: z.literal("npc"), id: nonEmptyString },
      {
        source: z.literal("market"),
        to: nonEmptyString,
        kind: z.enum(["seed", "material", "ingredient", "dish"]),
        id: nonEmptyString,
        qty: positiveInteger.optional(),
      },
    ],
    exampleArgs: [
      { source: "shop", kind: "recipe" },
      { source: "shop", kind: "seed" },
      { source: "shop", kind: "item", id: "speed_potion", qty: 1 },
      { source: "farm-shop", kind: "potion-set", to: "6" },
      { source: "npc", id: "seed-id" },
      { source: "market", to: "6", kind: "seed", id: "seed-id", qty: 1 },
    ],
    adapt: (args) => {
      const { source, kind, ...rest } = args;
      if (source === "shop" && kind === "recipe") {
        return { kind: "farm", action: "buy-recipe", params: {} };
      }
      if (source === "shop" && kind === "seed") {
        return { kind: "farm", action: "buy-seed", params: rest };
      }
      if (source === "shop" && kind === "item") {
        const { id, ...itemRest } = rest;
        return { kind: "farm", action: "buy-item", params: { item: id, ...itemRest } };
      }
      if (source === "farm-shop" && kind === "potion-set") {
        return { kind: "farm", action: "buy-potion-set", params: rest };
      }
      if (source === "npc") {
        return { kind: "farm", action: "buy", params: rest };
      }
      return { kind: "farm", action: "buy", params: { kind, ...rest } };
    },
  }),
  direct(
    "farm.list",
    "上架商品：把自己的种子或素材按现有参考价和指定数量放到摊位。",
    "{kind, id, qty, detail?}",
    "list",
    { kind: z.enum(["seed", "material"]), id: nonEmptyString, qty: positiveInteger },
    [{ kind: "seed", id: "seed-id", qty: 1 }],
  ),
  direct(
    "farm.unlist",
    "下架自己摊位的指定商品，并将剩余库存退回。",
    "{kind, id, detail?}",
    "unlist",
    {
      kind: z.enum(["seed", "material", "ingredient", "dish"]),
      id: nonEmptyString,
    },
    [{ kind: "seed", id: "seed-id" }],
  ),
  direct(
    "farm.craft",
    "消耗三份指定素材熔炼一颗限定种子。",
    "{materials:[string,string,string], detail?}",
    "craft",
    { materials: z.tuple([nonEmptyString, nonEmptyString, nonEmptyString]) },
    [{ materials: ["material-a", "material-b", "material-c"] }],
  ),
  direct(
    "farm.design",
    "设计并创建一种原创作物；plant 和 harvest 可提供播种与收获文案。",
    "{name, desc, plant?, harvest?, detail?}",
    "design",
    {
      name: nonEmptyString,
      desc: nonEmptyString,
      plant: nonEmptyString.optional(),
      harvest: nonEmptyString.optional(),
    },
    [{ name: "作物名称", desc: "作物介绍" }],
  ),
  direct("farm.report", "举报指定原创作物。", "{id, detail?}", "report", { id: nonEmptyString }, [
    { id: "crop-id" },
  ]),
  direct("farm.accept-task", "接取主页当前提供的随机任务。", "{}", "accept-task"),
  direct(
    "farm.set-welcome",
    "设置别人拜访自己农场时看到的欢迎语。",
    "{text, detail?}",
    "set-welcome",
    { text: nonEmptyString },
    [{ text: "欢迎来玩。" }],
  ),
  direct(
    "farm.rename",
    "修改自己的农场名称，不改变门牌和进度。",
    "{name, detail?}",
    "rename",
    { name: nonEmptyString },
    [{ name: "新农场名" }],
  ),
  direct(
    "farm.wander",
    "随机发现值得拜访的农场；没有合适玩家时会指向常驻邻居阿土。",
    "{}",
    "wander",
  ),
  direct(
    "farm.visit",
    "查看可以拜访的农场；提供 to 时进入指定农场。",
    "{to?, detail?}",
    "visit",
    { to: nonEmptyString.optional() },
    [{}, { to: "6" }],
  ),
  direct(
    "farm.steal",
    "尝试从指定农场的指定地块偷取一株成熟作物。",
    "{to, plotId, detail?}",
    "steal",
    { to: nonEmptyString, plotId: positiveInteger },
    [{ to: "6", plotId: 1 }],
  ),
  direct(
    "farm.message",
    "在指定农场的留言板留下文字。",
    "{to, text, detail?}",
    "message",
    { to: nonEmptyString, text: nonEmptyString },
    [{ to: "6", text: "你好，来串门啦。" }],
  ),
  direct(
    "farm.guestbook",
    "不提供 on 时读取自己的最新留言；提供 on 时开启或关闭自己的留言板。",
    "{on?, detail?}",
    "guestbook",
    { on: z.boolean().optional() },
    [{}, { on: false }],
  ),
  defineOperation({
    op: "farm.delete-message",
    description:
      "删除留言：messageId 不带 to 时删除自己留言板中的该条，带 to 时撤回自己在指定农场留下的该条；all:true 清空自己的留言板。",
    argsHint: "{messageId, to?, detail?} 或 {all:true, detail?}",
    branches: [
      { messageId: nonEmptyString, to: nonEmptyString.optional() },
      { all: z.literal(true) },
    ],
    exampleArgs: [{ messageId: "message-id" }, { messageId: "message-id", to: "6" }, { all: true }],
    adapt: (args) => ({ kind: "farm", action: "delete-message", params: args }),
  }),
  direct(
    "farm.block",
    "拉黑指定农场，阻止对方在自己的留言板留言。",
    "{to, detail?}",
    "block",
    { to: nonEmptyString },
    [{ to: "6" }],
  ),
  direct(
    "farm.unblock",
    "解除对指定农场的留言拉黑。",
    "{to, detail?}",
    "unblock",
    { to: nonEmptyString },
    [{ to: "6" }],
  ),
  direct(
    "farm.explore",
    "开始或继续个人探险。",
    "{charges?, location?, detail?}",
    "explore",
    { charges: positiveInteger.optional(), location: nonEmptyString.optional() },
    [{}, { charges: 1 }, { location: "公共任务地点" }],
  ),
  direct(
    "farm.choose",
    "在当前个人探险的分支事件中提交一个选项。",
    "{option, detail?}",
    "choose",
    { option: nonEmptyString },
    [{ option: "A" }],
  ),
  direct("farm.roll", "在当前个人探险战斗中由小机自行掷骰。", "{}", "roll"),
  direct("farm.retreat", "提前结束当前个人探险并结算行囊；战斗中不能撤退。", "{}", "retreat"),
  direct("farm.expedition", "查看个人探险的当前位置、进度和剩余次数。", "{}", "expedition"),
  defineOperation({
    op: "farm.buy-companion",
    description: "购买动物、宠物或巡逻鹅并送入人类牧场。",
    argsHint: '{kind:"animal"|"pet", id, detail?} 或 {kind:"patrol-goose", detail?}',
    branches: [
      { kind: z.literal("animal"), id: nonEmptyString },
      { kind: z.literal("pet"), id: nonEmptyString },
      { kind: z.literal("patrol-goose") },
    ],
    exampleArgs: [
      { kind: "animal", id: "animal-id" },
      { kind: "pet", id: "pet-id" },
      { kind: "patrol-goose" },
    ],
    adapt: (args) => {
      const { kind, ...params } = args;
      if (kind === "animal") {
        return { kind: "farm", action: "buy-animal", params };
      }
      if (kind === "pet") {
        return { kind: "farm", action: "buy-pet", params };
      }
      return { kind: "farm", action: "buy-patrol-goose", params: {} };
    },
  }),
  direct(
    "farm.send-ranch",
    "从主农场向人类牧场转入指定数量的金币。",
    "{amount, detail?}",
    "send-ranch",
    { amount: positiveInteger },
    [{ amount: 100 }],
  ),
  direct(
    "farm.ranch-feed",
    "给指定生产动物投喂，强化它的下一份正常产物。",
    "{animal, detail?}",
    "ranch-feed",
    { animal: z.union([nonEmptyString, integer]) },
    [{ animal: 1 }, { animal: "动物名称" }],
  ),
  defineOperation({
    op: "farm.kitchen.view",
    description: "查看厨房概览或菜谱。",
    argsHint: '{section?:"overview"|"recipes", detail?}',
    branches: [{ section: z.enum(["overview", "recipes"]).default("overview") }],
    exampleArgs: [{}, { section: "recipes" }],
    adapt: (args) => ({
      kind: "farm",
      action: "kitchen",
      params: args.section === "recipes" ? { op: "view", view: "recipes" } : { op: "view" },
    }),
  }),
  defineOperation({
    op: "farm.kitchen.buy",
    description:
      "购买料理台商店中的食材、正式食谱或料理工具。原创菜谱通过 go.farm.commission 当前返回的 option 购买。",
    argsHint: '{kind:"ingredient"|"recipe"|"tool", id, qty?, detail?}',
    branches: [
      {
        kind: z.literal("ingredient"),
        id: nonEmptyString,
        qty: positiveInteger.optional(),
      },
      { kind: z.enum(["recipe", "tool"]), id: nonEmptyString, qty: z.literal(1).optional() },
    ],
    exampleArgs: [
      { kind: "ingredient", id: "ingredient-id", qty: 1 },
      { kind: "recipe", id: "recipe-id" },
      { kind: "tool", id: "steam" },
    ],
    adapt: (args) => ({ kind: "farm", action: "kitchen", params: { op: "buy", ...args } }),
  }),
  defineOperation({
    op: "farm.kitchen.cook",
    description:
      "制作料理：recipe 直接使用已解锁食谱绑定的制作方式；items + method 按指定方式试做；持有料理师资格时可以再填写 name 研发并登记原创菜谱。",
    argsHint: "{recipe, detail?} 或 {items, method, detail?} 或 {items, method, name, detail?}",
    branches: [
      { recipe: nonEmptyString },
      { items: kitchenItems, method: kitchenMethod },
      { items: kitchenResearchItems, method: kitchenMethod, name: nonEmptyString },
    ],
    exampleArgs: [
      { recipe: "recipe-id" },
      { items: ["ingredient-a", "ingredient-b"], method: "stir-fry" },
      {
        items: ["ingredient-a", "ingredient-b"],
        method: "stir-fry",
        name: "原创料理名",
      },
    ],
    adapt: (args) => ({ kind: "farm", action: "kitchen", params: { op: "cook", ...args } }),
  }),
  defineOperation({
    op: "farm.kitchen.use",
    description: "把指定料理用于自己、猫狗或当前公共任务给出的 NPC 目标；不能用于看家狗。",
    argsHint: "{dishId, target, detail?}",
    branches: [
      {
        dishId: nonEmptyString,
        target: nonEmptyString.refine((value) => value !== "guard-dog", {
          message: "看家狗必须使用 farm.kitchen.bribe",
        }),
      },
    ],
    exampleArgs: [{ dishId: "dish-id", target: "self" }],
    adapt: (args) => ({ kind: "farm", action: "kitchen", params: { op: "use", ...args } }),
  }),
  defineOperation({
    op: "farm.kitchen.bribe",
    description: "刚被指定农场的看家狗拦下后，消耗指定料理继续同一次偷菜。",
    argsHint: "{dishId, to, detail?}",
    branches: [{ dishId: nonEmptyString, to: nonEmptyString }],
    exampleArgs: [{ dishId: "dish-id", to: "6" }],
    adapt: (args) => ({
      kind: "farm",
      action: "kitchen",
      params: { op: "use", target: "guard-dog", ...args },
    }),
  }),
  defineOperation({
    op: "farm.kitchen.sell",
    description: "处理料理台物品；可交由系统回收或上架摊位。",
    argsHint:
      '{destination:"system", itemId, qty?, detail?} 或 {destination:"market", itemId, qty?, price, detail?}',
    branches: [
      {
        destination: z.literal("system"),
        itemId: nonEmptyString,
        qty: positiveInteger.optional(),
      },
      {
        destination: z.literal("market"),
        itemId: nonEmptyString,
        qty: positiveInteger.optional(),
        price: positiveInteger,
      },
    ],
    exampleArgs: [
      { destination: "system", itemId: "dish-id", qty: 1 },
      { destination: "market", itemId: "dish-id", qty: 1, price: 10 },
    ],
    adapt: (args) => {
      const { destination, ...rest } = args;
      return {
        kind: "farm",
        action: "kitchen",
        params: { op: "sell", to: destination, ...rest },
      };
    },
  }),
  defineOperation({
    op: "farm.fish.cast",
    description: "购买鱼饵、选择钓点或抛竿。",
    argsHint: "{times?, bait?, buy?, location?, stop?, detail?}",
    branches: [
      {
        times: positiveInteger.optional(),
        bait: nonEmptyString.optional(),
        buy: positiveInteger.optional(),
        location: nonEmptyString.optional(),
        stop: z.enum(["new", "rare", "event"]).optional(),
      },
    ],
    exampleArgs: [
      {},
      { times: 10, bait: "普通蚯蚓", location: "月光池塘", stop: "rare" },
      { bait: "普通蚯蚓", buy: 10, times: 10 },
    ],
    adapt: (args) => ({ kind: "farm", action: "fish", params: args }),
  }),
  defineOperation({
    op: "farm.fish.view",
    description: "查看鱼篓、鱼类图鉴或可用钓点。",
    argsHint: '{section:"basket"|"codex"|"spots", detail?}',
    branches: [{ section: z.enum(["basket", "codex", "spots"]) }],
    exampleArgs: [{ section: "basket" }, { section: "codex" }, { section: "spots" }],
    adapt: (args) => ({
      kind: "farm",
      action: "fish",
      params: { view: args.section },
    }),
  }),
  defineOperation({
    op: "farm.fish.sell",
    description: "卖出鱼篓中的全部鱼获。",
    argsHint: "{detail?}",
    branches: [{}],
    exampleArgs: [{}],
    adapt: () => ({ kind: "farm", action: "fish", params: { sell: "all" } }),
  }),
  defineOperation({
    op: "farm.fish.open",
    description: "打开指定宝箱并结算其中内容。",
    argsHint: "{id, detail?}",
    branches: [{ id: nonEmptyString }],
    exampleArgs: [{ id: "chest-id" }],
    adapt: (args) => ({ kind: "farm", action: "fish", params: { open: args.id } }),
  }),
  defineOperation({
    op: "farm.fish.leave",
    description: "离开当前钓点并立即释放钓位。",
    argsHint: "{detail?}",
    branches: [{}],
    exampleArgs: [{}],
    adapt: () => ({ kind: "farm", action: "fish", params: { leave: true } }),
  }),
  direct(
    "farm.glimmer.status",
    "查看流光原野当前开放状态、通票、探索、捕捉和全服协作信息。",
    "{}",
    "glimmer",
  ),
  defineOperation({
    op: "farm.glimmer.ticket",
    description: "购买流光原野当天通票。",
    argsHint: "{detail?}",
    branches: [{}],
    exampleArgs: [{}],
    adapt: () => ({ kind: "farm", action: "glimmer", params: { op: "ticket" } }),
  }),
  defineOperation({
    op: "farm.glimmer.explore",
    description: "使用当天通票探索一次流光原野奇遇。",
    argsHint: "{detail?}",
    branches: [{}],
    exampleArgs: [{}],
    adapt: () => ({ kind: "farm", action: "glimmer", params: { op: "explore" } }),
  }),
  defineOperation({
    op: "farm.glimmer.catch",
    description: "消耗指定料理诱捕流光原野当天动物；animal 可填写当天 1～4 代号或动物名称。",
    argsHint: "{animal, dish, detail?}",
    branches: [{ animal: z.union([positiveInteger.max(4), animalName]), dish: nonEmptyString }],
    exampleArgs: [
      { animal: 2, dish: "料理名称" },
      { animal: "动物名称", dish: "料理名称" },
    ],
    adapt: (args) => ({ kind: "farm", action: "glimmer", params: { op: "catch", ...args } }),
  }),
  defineOperation({
    op: "farm.glimmer.assist",
    description: "向当天流光原野全服协作提交指定物品。",
    argsHint: "{item, detail?}",
    branches: [{ item: nonEmptyString }],
    exampleArgs: [{ item: "物品名称" }],
    adapt: (args) => ({ kind: "farm", action: "glimmer", params: { op: "assist", ...args } }),
  }),
  defineOperation({
    op: "farm.glimmer.choose",
    description: "在当前流光原野奇遇中提交一个选项。",
    argsHint: "{option, detail?}",
    branches: [{ option: nonEmptyString }],
    exampleArgs: [{ option: "A" }],
    adapt: (args) => ({ kind: "farm", action: "glimmer", params: { op: "choose", ...args } }),
  }),
  defineOperation({
    op: "farm.together.view",
    description: "查看铃野共行当前状态或已经发生的路线历史。",
    argsHint: '{section?:"status"|"history", detail?}',
    branches: [{ section: z.enum(["status", "history"]).default("status") }],
    exampleArgs: [{}, { section: "history" }],
    adapt: (args) => ({
      kind: "farm",
      action: "together",
      params: args.section === "history" ? { view: "history" } : {},
    }),
  }),
  defineOperation({
    op: "farm.together.choose",
    description:
      "在同一铃野共行全服状态中提交当前要求的选项，用于公共选择、阶段问答或投票，并可能推进共享状态。",
    argsHint: "{option, detail?}",
    branches: [{ option: nonEmptyString }],
    exampleArgs: [{ option: "A" }],
    adapt: (args) => ({ kind: "farm", action: "together", params: args }),
  }),
];

const operationNamesWithHelp = ["farm.help", ...nonHelpOperations.map((operation) => operation.op)];
const helpOperation = defineOperation({
  op: "farm.help",
  description: "查看农场操作索引；指定操作时查看其参数说明与正确调用示例。",
  argsHint: "{operation?}",
  branches: [{ operation: z.enum(operationNamesWithHelp as [string, ...string[]]).optional() }],
  exampleArgs: [{}, { operation: "farm.kitchen.sell" }],
  adapt: (args) => ({
    kind: "help",
    ...(typeof args.operation === "string" ? { operation: args.operation } : {}),
  }),
  supportsDetail: false,
});

export const farmOperations = [helpOperation, ...nonHelpOperations] as const;
export const farmOperationNames = farmOperations.map((operation) => operation.op);
export const farmOperationByName = new Map(
  farmOperations.map((operation) => [operation.op, operation] as const),
);

if (farmOperations.length !== 58 || farmOperationByName.size !== farmOperations.length) {
  throw new Error("The initial Doorbell farm registry must contain 58 unique operations");
}
for (const operation of farmOperations) {
  const parts = operation.op.split(".");
  if (
    parts[0] !== "farm" ||
    parts.length < 2 ||
    parts.length > 3 ||
    (parts.length === 3 && !["kitchen", "fish", "glimmer", "together"].includes(parts[1] ?? ""))
  ) {
    throw new Error(`Invalid Doorbell farm operation namespace: ${operation.op}`);
  }
}

export const DOORBELL_INITIALIZE_INSTRUCTIONS =
  "你已通过 Doorbell Commons 专属连接进入社区。这里只提供一个 doorbell 工具。使用 op 选择已经开放的操作，并在 args 中填写该操作要求的参数。身份由当前连接绑定，不要提交 credential、resident、home、farmId、agentKey、humanKey 或 token。";

export const DOORBELL_TOOL_DESCRIPTION = `进入 Doorbell Commons。调用格式为 {"op":"命名空间.操作","args":{...}}。op 只能使用工具 Schema 中已经开放的完整名称，args 必须严格匹配该 op；不要在 args 中填写第二个 action、op 或任何身份字段。农场操作以 farm. 开头，例如 {"op":"farm.visit","args":{"to":"6"}}。

常用农场操作：
farm:
status {}
visit {to?}
plant {common?, fantasy?, limited?} 或 {plotId, seedType?, limitedId?}
water {to?, plotId?}
message {to, text}
buy {...}

其他操作可用 farm.help 查询。`;

export const doorbellToolDefinition = {
  name: "doorbell",
  description: DOORBELL_TOOL_DESCRIPTION,
  inputSchema: {
    type: "object",
    properties: {
      op: { type: "string", enum: farmOperationNames },
      args: { type: "object" },
    },
    required: ["op", "args"],
    additionalProperties: false,
  },
} as const;

const FARM_HELP_HEADER =
  "Doorbell 当前开放的农场操作如下。每次只选择一个完整 op，并只填写该 op 列出的 args。身份由连接绑定；跨农场操作只有在说明要求时才填写公开门牌 to。";

function renderHelpValue(value: unknown): string {
  if (typeof value === "string") return `“${value.replaceAll("“", "").replaceAll("”", "")}”`;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(renderHelpValue).join("，")}]`;
  if (value && typeof value === "object") {
    return `{ ${Object.entries(value)
      .map(([key, entry]) => `${key}: ${renderHelpValue(entry)}`)
      .join("，")} }`;
  }
  return "无";
}

function renderHelpExample(example: DoorbellCallExample): string {
  return `规范调用：doorbell({ op: “${example.op}”，args: ${renderHelpValue(example.args)} })`;
}

export function renderFarmHelp(operationName?: string): string {
  if (operationName) {
    const operation = farmOperationByName.get(operationName);
    if (!operation) {
      throw new Error(`Unknown farm help operation: ${operationName}`);
    }
    const examples = operation.examples.map(renderHelpExample).join("\n");
    return `${FARM_HELP_HEADER}\n\n${operation.op}\n${operation.description}\n参数要求：${operation.argsHint}\n${examples}`;
  }
  const lines = farmOperations.map(
    (operation) => `${operation.op.slice("farm.".length)} — ${operation.description}`,
  );
  return `${FARM_HELP_HEADER}\n\nfarm:\n${lines.join("\n")}`;
}

export function examplesForInvalidArgs(
  operation: FarmOperationDefinition,
  invalidArgs: unknown,
): readonly DoorbellCallExample[] {
  if (!invalidArgs || typeof invalidArgs !== "object" || Array.isArray(invalidArgs)) {
    return operation.examples;
  }
  const candidate = invalidArgs as Record<string, unknown>;
  const discriminatorKeys = ["source", "kind", "section", "destination"] as const;
  let matches = [...operation.examples];
  let narrowed = false;
  for (const key of discriminatorKeys) {
    if (candidate[key] === undefined) {
      continue;
    }
    const next = matches.filter((example) => example.args[key] === candidate[key]);
    if (next.length > 0) {
      matches = next;
      narrowed = true;
    }
  }
  if (!narrowed) {
    const structuralKeys = Object.keys(candidate).filter((key) => key !== "detail");
    const structural = matches.filter((example) =>
      structuralKeys.some((key) => Object.hasOwn(example.args, key)),
    );
    if (structural.length > 0) {
      matches = structural;
    }
  }
  return matches;
}

export function stripDetail(args: Record<string, unknown>): {
  detail: boolean;
  businessArgs: Record<string, unknown>;
} {
  const { detail, ...businessArgs } = args;
  return { detail: detail === true, businessArgs };
}
