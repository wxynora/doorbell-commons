import { COOKING_MOLDS } from './cooking-rules.mjs';
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => isRecord(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const int = value => Number.isSafeInteger(value);
const empty = value => exact(value, []);
const failure = () => ({ success: false, error: { issues: [] } });
const success = data => ({ success: true, data });
function validateCommand(command) {
  if (!isRecord(command) || !nonempty(command.op) || !isRecord(command.args)) return null;
  const { op, args, requestId } = command;
  const write = op !== 'view';
  if (write ? !nonempty(requestId) : Object.hasOwn(command, 'requestId')) return null;
  const commandKeys = write ? ['op', 'args', 'requestId'] : ['op', 'args'];
  if (!exact(command, commandKeys)) return null;
  if (op === 'view' && empty(args)) return command;
  if (op === 'collection_start' && empty(args)) return command;
  if (op === 'collection_pick' && exact(args, ['tileId','sessionId','revision']) &&
      nonempty(args.tileId) && nonempty(args.sessionId) && int(args.revision) && args.revision >= 0) return command;
  if (op === 'collection_shake' && exact(args, ['sessionId','revision']) &&
      nonempty(args.sessionId) && int(args.revision) && args.revision >= 0) return command;
  if (op === 'collection_timer' && exact(args, ['action','sessionId','stage','transitionVersion']) &&
      ['enter','pause'].includes(args.action) && nonempty(args.sessionId) && int(args.stage) && args.stage >= 1 && args.stage <= 2 &&
      int(args.transitionVersion) && args.transitionVersion > 0) return command;
  if (op === 'craft' && exact(args, ['materials','shape','process'])) {
    const materials = args.materials;
    const process = args.process;
    if (!isRecord(materials) || !Object.entries(materials).every(([key, value]) => key.length > 0 && int(value) && value > 0) ||
        !nonempty(args.shape) || !COOKING_MOLDS.some(mold => mold.id === args.shape) ||
        !exact(process, ['additions','stirTurns','fills']) || !Array.isArray(process.additions) || process.additions.length !== 3 ||
        !process.additions.every(item => exact(item, ['material','at']) && nonempty(item.material) && int(item.at) && item.at >= 0 && item.at <= 100) ||
        !int(process.stirTurns) || process.stirTurns < 4 || !Array.isArray(process.fills) || process.fills.length !== 6 ||
        !process.fills.every(value => typeof value === 'number' && value >= 0.8 && value <= 1.25)) return null;
    return command;
  }
  if (op === 'buy' && exact(args, ['material']) && nonempty(args.material)) return command;
  if (op === 'buy_cart' && exact(args, ['materials']) && Array.isArray(args.materials) && args.materials.length > 0 &&
      args.materials.every(nonempty) && new Set(args.materials).size === args.materials.length) return command;
  if (op === 'gift' && exact(args, ['candyIds','doorplate']) && Array.isArray(args.candyIds) &&
      args.candyIds.length > 0 && args.candyIds.every(nonempty) && nonempty(args.doorplate)) return command;
  if (op === 'eat' && (exact(args, ['candyId']) || exact(args, ['candyId','target'])) &&
      nonempty(args.candyId) && (!Object.hasOwn(args, 'target') || ['self','other'].includes(args.target))) return command;
  if (['explore_start','explore_move','explore_ascend','explore_end'].includes(op)) return null;
  return null;
}
export const humanHalloweenCommand = Object.freeze({ safeParse(value) {
  const data = validateCommand(value);
  return data ? success(data) : failure();
} });
