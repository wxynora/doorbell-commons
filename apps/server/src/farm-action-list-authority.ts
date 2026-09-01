import type { FarmActionListItem } from "@doorbell/protocol";
import type { FarmActionListAuthorityStateReader } from "./farm-action-list-authority-client.js";
import type {
  FarmActionListAuthorityReader,
  FarmActionListProfile,
  FarmActionListResolvedItem,
} from "./farm-action-list-preflight.js";
import type { FarmHumanCatalogReader } from "./farm-catalog-client.js";
import type { FarmHumanFieldReader } from "./farm-human-client.js";
import type { FarmHumanKitchenReader } from "./farm-kitchen-client.js";

export interface FarmActionListAuthorityOptions {
  fieldReader: FarmHumanFieldReader;
  catalogReader: FarmHumanCatalogReader;
  kitchenReader: FarmHumanKitchenReader;
  actionListStateReader: FarmActionListAuthorityStateReader;
}

function identity(profile: FarmActionListProfile) {
  return {
    farmDoorplate: profile.farmDoorplate,
    farmHumanKey: profile.farmHumanKey,
  };
}

export class FarmActionListAuthority implements FarmActionListAuthorityReader {
  readonly #fieldReader: FarmHumanFieldReader;
  readonly #catalogReader: FarmHumanCatalogReader;
  readonly #kitchenReader: FarmHumanKitchenReader;
  readonly #actionListStateReader: FarmActionListAuthorityStateReader;

  constructor(options: FarmActionListAuthorityOptions) {
    this.#fieldReader = options.fieldReader;
    this.#catalogReader = options.catalogReader;
    this.#kitchenReader = options.kitchenReader;
    this.#actionListStateReader = options.actionListStateReader;
  }

  async readField(profile: FarmActionListProfile) {
    const [field, catalog] = await Promise.all([
      this.#fieldReader.readField(identity(profile)),
      this.#catalogReader.readCatalog(identity(profile)),
    ]);
    const categoryByCrop = new Map(
      catalog.data.codex.status === "available"
        ? catalog.data.codex.entries.map((entry) => [entry.crop_id, entry.category] as const)
        : [],
    );
    let commonSeeds = 0;
    let fantasySeeds = 0;
    const limitedSeeds: Record<string, number> = {};
    if (catalog.data.backpack.status === "available") {
      for (const item of catalog.data.backpack.items) {
        if (item.kind !== "seed" || item.quantity <= 0) continue;
        const category = categoryByCrop.get(item.item_id);
        if (category === "common") commonSeeds += item.quantity;
        else if (category === "fantasy") fantasySeeds += item.quantity;
        else if (category === "limited" || category === "ugc") {
          limitedSeeds[item.item_id] = item.quantity;
        }
      }
    }
    return {
      maturePlotCount: field.data.plots.filter((plot) => plot.state === "ripe").length,
      emptyPlotCount: field.data.plots.filter((plot) => plot.state === "empty").length,
      commonSeeds,
      fantasySeeds,
      limitedSeeds,
    };
  }

  async readSteal(profile: FarmActionListProfile) {
    const authority = await this.#actionListStateReader.readActionListAuthority(identity(profile));
    return {
      targets: authority.data.steal.targets.flatMap((target) =>
        target.ripe_plot_ids.map((plotId) => ({ target: target.target, plotId })),
      ),
    };
  }

  async readWater(profile: FarmActionListProfile) {
    const authority = await this.#actionListStateReader.readActionListAuthority(identity(profile));
    return {
      targets: authority.data.water.targets.map((target) => ({ target: target.target })),
      visitedTargets: authority.data.water.visited_targets.map((target) => ({
        target: target.target,
      })),
    };
  }

  async readFish(profile: FarmActionListProfile) {
    const authority = await this.#actionListStateReader.readActionListAuthority(identity(profile));
    return {
      remainingAttempts: authority.data.fishing.remaining_today,
      availableBaits: authority.data.fishing.available_baits.flatMap((bait) => [
        bait.bait_id,
        bait.name,
      ]),
    };
  }

  async readExplore(profile: FarmActionListProfile) {
    const catalog = await this.#catalogReader.readCatalog(identity(profile));
    if (catalog.data.expedition.status !== "available") {
      throw new Error("The expedition authority is unavailable");
    }
    return {
      remainingCharges: catalog.data.expedition.remaining_today,
      activeJourney: catalog.data.expedition.active,
    };
  }

  async resolveCook(
    profile: FarmActionListProfile,
    _item: Extract<FarmActionListItem, { kind: "cook" }>,
  ): Promise<FarmActionListResolvedItem> {
    const kitchen = await this.#kitchenReader.readKitchen(identity(profile));
    const data = kitchen.data;
    const quantities = new Map<string, number>();
    if (data.stacked_ingredients.status === "available") {
      for (const ingredient of data.stacked_ingredients.items) {
        if (ingredient.status === "available" && ingredient.quantity !== null) {
          quantities.set(ingredient.ingredient_id, ingredient.quantity);
        }
      }
    }
    const fishCount =
      data.fish_instances.status === "available"
        ? data.fish_instances.items.filter((fish) => fish.status === "available").length
        : 0;
    if (data.known_recipes.status !== "available") {
      throw new Error("The kitchen recipe authority is unavailable");
    }
    const ownedTools = new Set(
      data.tools.status === "available"
        ? data.tools.items
            .filter((tool) => tool.status === "available" && tool.owned)
            .map((tool) => tool.tool_id)
        : [],
    );
    const recipe = data.known_recipes.items.find((candidate) => {
      if (candidate.status !== "available") return false;
      const hasIngredients = candidate.ingredients.every((ingredient) => {
        if (ingredient.status !== "available" || ingredient.quantity === null) return false;
        if (ingredient.ingredient_id === "fish:any") return fishCount >= ingredient.quantity;
        return (quantities.get(ingredient.ingredient_id) ?? 0) >= ingredient.quantity;
      });
      const hasTool = candidate.tool.id === null || ownedTools.has(candidate.tool.id);
      return hasIngredients && hasTool;
    });
    if (!recipe) {
      return {
        actionable: false,
        displayText: "做饭",
        reason: "当前没有可制作料理",
        call: null,
      };
    }
    return {
      actionable: true,
      displayText: "做饭",
      reason: null,
      call: { op: "farm.kitchen.cook", args: { recipe: recipe.recipe_id } },
    };
  }

  async resolveActivity(
    profile: FarmActionListProfile,
    item: Extract<FarmActionListItem, { kind: "activity" }>,
  ): Promise<FarmActionListResolvedItem> {
    const activities = await this.readActivities(profile);
    const activity = activities.find((candidate) => candidate.activityId === item.activity_id);
    if (!activity) {
      return {
        actionable: false,
        displayText: `参加活动：${item.activity_id}`,
        reason: "当前活动已经不在开放列表",
        call: null,
      };
    }
    return {
      actionable: !activity.completed,
      displayText: `参加活动：${activity.name}`,
      reason: activity.completed ? "今天已经参加过" : null,
      call: activity.call,
    };
  }

  async readActivities(profile: FarmActionListProfile) {
    const authority = await this.#actionListStateReader.readActionListAuthority(identity(profile));
    return authority.data.activities.map((activity) => ({
      activityId: activity.activity_id,
      name: activity.name,
      completed: activity.completed,
      call: activity.call,
    }));
  }
}
