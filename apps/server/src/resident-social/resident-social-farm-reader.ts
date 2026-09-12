import type { FarmHumanBulletinReader } from "../farm-bulletin-client.js";
import type { RegistrationAuthService } from "../registration-auth.js";
import type { ResidentSocialStore } from "./resident-social-store.js";

type Community = Awaited<ReturnType<RegistrationAuthService["getCurrentSessionWithMembership"]>>;

/** Reads structured farm facts only; never acknowledges or edits the farm stream. */
export function createResidentSocialFarmRefresh(
  reader: Pick<FarmHumanBulletinReader, "readBulletin">,
  store: Pick<ResidentSocialStore, "recordFarmTrail">,
) {
  return async (community: Community): Promise<void> => {
    const { farmDoorplate, farmHumanKey } = community.farmBinding;
    if (!farmHumanKey) throw new Error("farm_activity_unavailable");
    const result = await reader.readBulletin({ farmDoorplate, farmHumanKey });
    if (result.subject.farm_doorplate !== farmDoorplate || result.data.trail.status !== "available") {
      throw new Error("farm_activity_unavailable");
    }
    store.recordFarmTrail(community.resident.residentId, result.data.trail.entries);
  };
}
