import { MATERIAL_COLLIDER_PROFILES_V3 } from './material-profiles-v3.mjs';

// Version 2 collider dimensions remain available for saved v2 collections.
export const MATERIAL_COLLIDER_PROFILES_V2 = Object.freeze({
  "砂糖": Object.freeze({ collider: "box", size: Object.freeze([1.0456,0.7436,1.13]) }),
  "红糖": Object.freeze({ collider: "box", size: Object.freeze([1.13,0.454,0.6793]) }),
  "蜂蜜": Object.freeze({ collider: "box", size: Object.freeze([1.0871,0.8084,1.13]) }),
  "牛奶": Object.freeze({ collider: "box", size: Object.freeze([0.6151,0.6077,1.13]) }),
  "黄油": Object.freeze({ collider: "box", size: Object.freeze([1.13,0.586,0.7088]) }),
  "南瓜泥": Object.freeze({ collider: "box", size: Object.freeze([1.1272,1.1272,1.13]) }),
  "苹果": Object.freeze({ collider: "box", size: Object.freeze([0.9568,0.9636,1.13]) }),
  "肉桂": Object.freeze({ collider: "box", size: Object.freeze([1.13,0.5578,0.5755]) }),
  "薄荷叶": Object.freeze({ collider: "box", size: Object.freeze([1.13,0.2072,0.9537]) }),
  "紫薯": Object.freeze({ collider: "box", size: Object.freeze([1.13,0.8756,0.5284]) }),
  "栗子": Object.freeze({ collider: "box", size: Object.freeze([1.13,0.9673,1.06]) }),
  "玉米粒": Object.freeze({ collider: "box", size: Object.freeze([1.13,0.481,1.1005]) }),
  "焦糖": Object.freeze({ collider: "box", size: Object.freeze([1.13,0.3295,0.7503]) }),
  "黑巧克力": Object.freeze({ collider: "box", size: Object.freeze([1.13,0.3295,0.7503]) }),
  "夜影莓": Object.freeze({ collider: "box", size: Object.freeze([0.9772,1.0344,1.13]) }),
  "蔓越莓": Object.freeze({ collider: "box", size: Object.freeze([1.0207,1.028,1.13]) }),
  "枫糖浆": Object.freeze({ collider: "box", size: Object.freeze([1.0197,0.3137,1.13]) }),
  "香草荚": Object.freeze({ collider: "box", size: Object.freeze([1.13,0.5413,0.8051]) }),
  "桂花蜜": Object.freeze({ collider: "box", size: Object.freeze([1.0871,0.8084,1.13]) }),
  "蛛丝棉花糖": Object.freeze({ collider: "box", size: Object.freeze([1.13,1.0713,1.0098]) }),
  "蝙蝠翼糖片": Object.freeze({ collider: "box", size: Object.freeze([1.13,0.1386,0.7002]) }),
  "月光露": Object.freeze({ collider: "box", size: Object.freeze([0.7535,0.6548,1.13]) }),
  "幽灵奶霜": Object.freeze({ collider: "box", size: Object.freeze([1.13,0.8274,1.0393]) }),
  "星屑糖粉": Object.freeze({ collider: "box", size: Object.freeze([1.13,0.9792,1.0806]) }),
  "魔女紫罗兰花瓣": Object.freeze({ collider: "box", size: Object.freeze([1.0752,0.2121,1.13]) }),
  "午夜黑醋栗": Object.freeze({ collider: "box", size: Object.freeze([0.9659,0.9725,1.13]) }),
  "骷髅糖霜": Object.freeze({ collider: "box", size: Object.freeze([0.9389,0.7281,1.13]) }),
  "幽光岩盐": Object.freeze({ collider: "box", size: Object.freeze([1.13,1.1488,0.9416]) }),
  "南瓜王糖心": Object.freeze({ collider: "box", size: Object.freeze([1.0278,1.0278,1.13]) }),
  "血月石榴": Object.freeze({ collider: "box", size: Object.freeze([1.0252,1.0077,1.13]) }),
  "幽灵蜂后蜜": Object.freeze({ collider: "box", size: Object.freeze([1.13,0.7237,0.9656]) }),
  "月影薄荷": Object.freeze({ collider: "box", size: Object.freeze([1.13,0.2072,0.9537]) }),
  "极光糖浆": Object.freeze({ collider: "box", size: Object.freeze([0.7217,0.5957,1.13]) }),
  "黑猫私藏奶油": Object.freeze({ collider: "box", size: Object.freeze([1.0133,0.8824,1.13]) }),
  "金南瓜籽": Object.freeze({ collider: "box", size: Object.freeze([1.13,0.294,1.0831]) }),
  "永夜花蜜": Object.freeze({ collider: "box", size: Object.freeze([0.6587,0.581,1.13]) }),
  "魔女秘制焦糖": Object.freeze({ collider: "box", size: Object.freeze([0.9419,0.9419,1.13]) }),
  "午夜蜂巢糖": Object.freeze({ collider: "box", size: Object.freeze([1.13,0.2996,1.0254]) }),
  "星落糖晶": Object.freeze({ collider: "box", size: Object.freeze([1.13,0.948,1.0583]) }),
});

export const LATEST_PILE_MODEL_VERSION = 3;
export const MATERIAL_COLLIDER_PROFILES_BY_VERSION = Object.freeze({
  2: MATERIAL_COLLIDER_PROFILES_V2,
  3: MATERIAL_COLLIDER_PROFILES_V3,
});

export function materialColliderProfile(name, modelVersion = LATEST_PILE_MODEL_VERSION) {
  const profiles = MATERIAL_COLLIDER_PROFILES_BY_VERSION[modelVersion];
  if (!profiles) throw new TypeError('unsupported_pile_model_version');
  const profile = profiles[name];
  if (!profile) throw new TypeError('unknown_pile_material');
  return profile;
}
