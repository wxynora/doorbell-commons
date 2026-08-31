import { createHash } from "node:crypto";
import { advance, humanHarvestAll, humanHarvestLeft, pushSocialInbox } from "../engine.js";
import { rollSeasonHarvest } from "../season-events.js";
import { checkTitles } from "../titles.js";
import { replaceFarm } from "../store.js";
import { getCrop } from "../content.js";
import { projectHumanField } from "./human-structured.js";
import {
  createMinimalHumanActionReceipt,
  replayMinimalHumanActionReceipt,
} from "../minimal-action-receipt.js";

function responseFor(farm, now, result) {
  const resource = projectHumanField(farm, now);
  return {
    data: { result, resource: resource.data },
    revision: resource.revision,
    server_time: resource.server_time,
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = canonicalize(value[key]);
    return sorted;
  }
  return value;
}

function fingerprint(body) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonicalize({
          farm_human_key: body.farm_human_key,
          expected_farm_doorplate: body.expected_farm_doorplate,
          expected_revision: body.expected_revision,
          payload: body.payload,
        }),
      ),
    )
    .digest("hex");
}

function errorResponse(code, message, currentRevision) {
  const error = { code, message };
  if (currentRevision) error.current_revision = currentRevision;
  return { status: 409, json: { error } };
}

function harvestPlotIds(working, states) {
  // harvestAll walks plots in farm order.  A bonus "连收" can ripen a later
  // plot during the same walk, so include every originally occupied plot that
  // is empty after the chain, not only the plots ripe before the first roll.
  return working.plots
    .filter((plot, index) => states[index]?.hadCrop && !plot.crop)
    .map((plot) => plot.id);
}

/**
 * Run the old Human UI action chain on an isolated farm clone.  The original
 * farm is replaced exactly once, after the receipt has been added to the clone.
 */
export function handleHumanHarvestAssist(farm, body, now = Date.now(), options = {}) {
  const receipts = farm.doorbellHumanHarvestReceipts ?? {};
  const key = body.idempotency_key;
  const fp = fingerprint(body);
  if (Object.prototype.hasOwnProperty.call(receipts, key)) {
    const old = receipts[key];
    if (old?.fingerprint !== fp) {
      return {
        status: 409,
        json: {
          error: {
            code: "idempotency_conflict",
            message: "This idempotency key was used for a different request",
          },
        },
      };
    }
    try {
      const response = replayMinimalHumanActionReceipt(old, fp, responseFor(farm, now, null));
      return response
        ? { status: 200, json: response }
        : {
          status: 409,
          json: {
            error: {
              code: "idempotency_conflict",
              message: "This idempotency key was used for a different request",
            },
          },
        };
    } catch {
      return { status: 503, json: { error: { code: "farm_unavailable", message: "The harvest could not be read" } } };
    }
  }

  let current;
  try {
    current = projectHumanField(farm, now);
  } catch {
    return { status: 503, json: { error: { code: "farm_unavailable", message: "The harvest could not be read" } } };
  }
  if (current.revision !== body.expected_revision)
    return errorResponse("state_conflict", "The farm field has changed", current.revision);

  const working = structuredClone(farm);
  try {
    // Keep this order identical to the legacy /ui/<humanKey>/harvest route.
    advance(working, now);
    const states = working.plots.map((plot) => ({
      hadCrop: !!plot.crop,
      ripe: !!plot.crop?.ripe,
    }));
    const coinsBefore = working.coins ?? 0;
    const silverBefore = working.silver ?? 0;
    const remainingBefore = humanHarvestLeft(working, now);
    const canRollSeason = states.some((state) => state.ripe) && remainingBefore > 0;
    const season = canRollSeason ? rollSeasonHarvest(working, now) : null;
    const harvest = humanHarvestAll(working, now, season?.mod, options);
    if (!harvest.ok) {
      return errorResponse(
        remainingBefore > 0 ? "no_ripe_plots" : "harvest_assist_exhausted",
        harvest.error,
        current.revision,
      );
    }

    pushSocialInbox(
      working,
      `🌾 ${working.humanName || "你的伴侣"}刚帮你一键收了 ${harvest.count} 株，空出了 ${harvest.count} 块地。`,
      now,
    );
    const titles = checkTitles(working);
    const plotIds = harvestPlotIds(working, states);
    const harvests = harvest.results.map((item, index) => {
      const crop = getCrop(item.crop.id) ?? item.crop;
      const value = item.value ?? 0;
      const bonusValue = (item.bonus?.extraCoins ?? 0) + (item.codexReward ?? 0);
      return {
        plot_id: plotIds[index] ?? null,
        crop: {
          crop_id: crop.id,
          name: crop.name,
          category: crop.category,
          rarity: crop.rarity,
        },
        quality: item.quality ? { name: item.quality.name } : null,
        value,
        currency: item.currency,
        is_new: !!item.isNew,
        material_drop: item.drop
          ? { id: item.drop.id, name: item.drop.name, quantity: 1 }
          : null,
        potion_drop: item.potionDrop
          ? { id: "speed_potion", name: "加速药水", quantity: 1 }
          : null,
        bonus_value: bonusValue,
      };
    });
    const result = {
      receipt_id: key,
      harvested_count: harvest.count,
      // Include the complete legacy chain's currency delta, including a
      // task reward that may be granted from inside harvest().
      farm_coins_gained: (working.coins ?? 0) - coinsBefore,
      silver_gained: (working.silver ?? 0) - silverBefore,
      harvests,
      season_event: season?.hit
        ? { id: season.hit.id ?? season.hit.name, label: season.hit.name }
        : null,
      new_titles: titles.map((title) => ({ title_id: title.id, name: title.name })),
    };
    const response = responseFor(working, now, result);

    // Receipt persistence belongs to the same clone and the same atomic
    // replaceFarm commit as the gameplay result.
    working.doorbellHumanHarvestReceipts = {
      ...(working.doorbellHumanHarvestReceipts ?? {}),
      [key]: createMinimalHumanActionReceipt(fp, response),
    };
    replaceFarm(farm.id, working);
    return { status: 200, json: response };
  } catch {
    // Any partial engine result or failed save is discarded with the clone;
    // the authoritative farm remains untouched.
    return { status: 503, json: { error: { code: "farm_unavailable", message: "The harvest could not be saved" } } };
  }
}
