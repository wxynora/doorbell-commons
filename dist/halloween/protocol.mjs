const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => isRecord(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const failure = () => ({ success: false, error: { issues: [] } });
const success = data => ({ success: true, data });

function validateCommand(command) {
  if (!isRecord(command) || !nonempty(command.op) || !isRecord(command.args)) return null;
  const { op, args, requestId } = command;
  if (op === 'view' && exact(command, ['op', 'args']) && exact(args, [])) return command;
  if (op !== 'eat' || !exact(command, ['op', 'args', 'requestId']) || !nonempty(requestId)) return null;
  if (!(exact(args, ['candyId']) || exact(args, ['candyId', 'target'])) || !nonempty(args.candyId) ||
      (Object.hasOwn(args, 'target') && !['self', 'other'].includes(args.target))) return null;
  return command;
}

export const humanHalloweenCommand = Object.freeze({ safeParse(value) {
  const data = validateCommand(value);
  return data ? success(data) : failure();
} });
