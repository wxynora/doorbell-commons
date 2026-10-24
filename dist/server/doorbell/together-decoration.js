import { allFarms, replaceFarm, withWorldCommitContext } from "../../store.js";
import { stageTogetherDecoration, assertTogetherDecorationReplay } from "../../domain/farm-decoration/activity-reward.js";
import { assertTogetherTitleReplay, stageTogetherTitles } from "../../domain/together/title-reward.js";

// Uses the existing migrated resident binding, including accrued rewards after
// access revocation; it does not restore access or create a Farm.
export function createTogetherDecorationRewards() {
  return {
    assertTitleGrant(input) {
      assertTogetherTitleReplay(allFarms(), input);
      assertTogetherDecorationReplay(allFarms(), input);
    },
    grantTitles(input) {
      assertTogetherTitleReplay(allFarms(), input);
      const matches = allFarms().filter(farm => farm.doorbellMcpMigration?.residentId === input.resident_id);
      if (matches.length !== 1) throw new Error("together_title_binding_unavailable");
      const farm = matches[0], working = stageTogetherTitles(farm, input);
      if (working)
        withWorldCommitContext({ balanceAuthority: "ledger", actor: "system" }, () => replaceFarm(farm.id, working));
      return [...input.titles];
    },
    grant(input) {
      const matches = allFarms().filter(farm => farm.doorbellMcpMigration?.residentId === input.resident_id);
      if (matches.length !== 1) throw new Error("together_decoration_binding_unavailable");
      const farm = matches[0], working = stageTogetherDecoration(farm, input);
      if (working)
        withWorldCommitContext({ balanceAuthority: "ledger", actor: "system" }, () => replaceFarm(farm.id, working));
      return { item_id: input.decoration.item_id, quantity: input.decoration.quantity };
    },
  };
}
