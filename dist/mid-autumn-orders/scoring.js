// Local candidate only. Cake fields match the existing DIY preview;
// callers must load owned, unlocked cakes from authoritative storage.
const SWEETNESS = Object.freeze([90, 80, 55, 45]); // 豆沙、莲蓉、黑芝麻、五仁
const SHAPES = Object.freeze({ 圆月: 40, 花朵: 75, 玉兔: 100 });
const PATTERNS = Object.freeze({
  无: 20, 乌萨奇: 100, 小熊: 100, "Hello Kitty": 100, 狐狸: 100,
  樱花: 70, 小雏菊: 70, 桂枝: 70, 足印: 100,
  星星: 80, 弯月: 80, 星月: 80, 流云: 80,
  自嘲熊: 100, 小八: 100, 布丁狗: 100, 大耳狗: 100, 美乐蒂: 100,
});

export const DIY_OPTIONS = Object.freeze({
  fillings: Object.freeze(["豆沙", "莲蓉", "黑芝麻", "五仁"]),
  shapes: Object.freeze(Object.keys(SHAPES)),
  patterns: Object.freeze(Object.keys(PATTERNS)),
  bake: Object.freeze({ min: 0, max: 100 }),
});

/** Order preferences are server-owned; inputs are the existing Human DIY fields. */
export function scorePreferenceOrder(kind, cakes, features = { pattern: true }) {
  const box = kind === "variety" || kind === "matching";
  const items = Array.isArray(cakes) ? cakes : [cakes];
  if (items.length !== (box ? 4 : 1)) throw new TypeError("Invalid order size");
  Array.from(items, dimensions);
  const cake = items[0];
  const d = dimensions(cake);
  const flower = ["樱花", "小雏菊", "桂枝"].includes(cake.pattern);
  const moon = ["弯月", "星月"].includes(cake.pattern);
  const sky = ["星星", "流云"].includes(cake.pattern) || moon;
  const unique = key => new Set(items.map(item => item[key])).size;
  const matching = key => Math.max(...items.map(item => items.filter(other => other[key] === item[key]).length)) * 25;
  let parts;
  switch (kind) {
    case "sweet_cute": parts = [[d.sweetness, .5], [features.pattern ? d.cuteness : Math.min(100, SHAPES[cake.shape] / 75 * 100), .5]]; break;
    case "light_elegant": parts = [
      [Math.max(0, [35, 55, 85, 100][cake.filling] - (cake.yolk ? 20 : 0)), .6],
      [({ 圆月: 90, 花朵: 100, 玉兔: 45 }[cake.shape] + (cake.pattern === "无" ? 80 : flower ? 100 : sky ? 90 : 40)) / 2, .4],
    ]; break;
    case "rich": parts = [
      [Math.min(100, [55, 70, 90, 85][cake.filling] + (cake.yolk ? 10 : 0)), .7],
      [Math.max(0, 100 - 2 * Math.abs(cake.bake - 75)), .3],
    ]; break;
    case "traditional": parts = [
      [[95, 100, 85, 100][cake.filling], .4],
      [cake.shape === "圆月" ? 100 : 50, .3],
      [moon ? 100 : sky ? 80 : flower ? 70 : cake.pattern === "无" ? 60 : 30, .3],
    ]; break;
    case "variety": parts = [
      [unique("filling") * 25, .5], [unique("shape") / 3 * 100, .25],
      [new Set(items.filter(item => item.pattern !== "无").map(item => item.pattern)).size * 25, .25],
    ]; break;
    case "matching": parts = [
      [matching("shape"), .4], [matching("pattern"), .4],
      [100 - (Math.max(...items.map(item => item.bake)) - Math.min(...items.map(item => item.bake))), .2],
    ]; break;
    default: throw new TypeError("Unknown order preference");
  }
  const score = Math.round(parts.reduce((sum, [value, weight]) => sum + value * weight, 0));
  return { score, grade: score >= 85 ? "excellent" : score >= 65 ? "pleased" : "ordinary",
    dimensionScores: parts.map(([value]) => value) };
}

function dimensions(cake) {
  if (!cake || typeof cake !== "object" || Array.isArray(cake)
      || !Number.isInteger(cake.filling) || cake.filling < 0 || cake.filling >= SWEETNESS.length
      || typeof cake.yolk !== "boolean"
      || typeof cake.shape !== "string" || !Object.hasOwn(SHAPES, cake.shape)
      || typeof cake.pattern !== "string" || !Object.hasOwn(PATTERNS, cake.pattern)
      || !Number.isFinite(cake.bake) || cake.bake < 0 || cake.bake > 100) {
    throw new TypeError("Invalid mooncake attributes");
  }
  return {
    sweetness: Math.max(0, SWEETNESS[cake.filling] - (cake.yolk ? 10 : 0)),
    cuteness: (SHAPES[cake.shape] + PATTERNS[cake.pattern]) / 2,
  };
}

/** Deterministic preference score; bake is validated but does not affect these dimensions. */
export function scoreMooncakeOrder(cakes, weights) {
  if (!weights || typeof weights !== "object" || Array.isArray(weights)
      || Object.keys(weights).some(key => key !== "sweetness" && key !== "cuteness")
      || !Number.isFinite(weights.sweetness) || weights.sweetness < 0
      || !Number.isFinite(weights.cuteness) || weights.cuteness < 0
      || !Number.isFinite(weights.sweetness + weights.cuteness)
      || weights.sweetness + weights.cuteness <= 0) {
    throw new TypeError("Invalid order preference weights");
  }
  const items = Array.isArray(cakes) ? cakes : [cakes];
  if (!items.length) throw new TypeError("Order requires at least one mooncake");
  // Array.from also turns sparse entries into undefined, which validation rejects.
  const values = Array.from(items, dimensions);
  const average = {
    sweetness: values.reduce((sum, item) => sum + item.sweetness / values.length, 0),
    cuteness: values.reduce((sum, item) => sum + item.cuteness / values.length, 0),
  };
  const total = weights.sweetness + weights.cuteness;
  const score = Math.round(average.sweetness * (weights.sweetness / total)
    + average.cuteness * (weights.cuteness / total));
  return {
    score,
    dimensions: average,
    grade: score >= 85 ? "excellent" : score >= 65 ? "pleased" : "ordinary",
  };
}
