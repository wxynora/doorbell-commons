// Select only after the common entry cost has succeeded. The caller persists RNG and reward together.
export function selectOutcome(option, rng) {
  if (!option.outcomes) return option;
  const roll = rng.next() * 100;
  let total = 0;
  for (const outcome of option.outcomes) {
    total += outcome.weight;
    if (roll < total) return outcome;
  }
  return option.outcomes[option.outcomes.length - 1];
}
