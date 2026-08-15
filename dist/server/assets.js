import { existsSync, readFileSync } from "node:fs";

export function createAssetHandler(assetRoot) {
    const publicAssets = new Map([
        ["animal-codex-atlas.png", new URL("animal-codex-atlas.png", assetRoot)],
        ["alpaca-codex.png", new URL("alpaca-codex.png", assetRoot)],
        ["ranch-scene-background.png", new URL("ranch-scene-background.png", assetRoot)],
        ["ranch-scene-background-mobile.png", new URL("ranch-scene-background-mobile.png", assetRoot)],
        ["glimmer/variant-1.png", new URL("glimmer/variant-1.png", assetRoot)],
        ["glimmer/variant-2.png", new URL("glimmer/variant-2.png", assetRoot)],
        ["glimmer/variant-3.png", new URL("glimmer/variant-3.png", assetRoot)],
        ["glimmer/map-scene.png", new URL("glimmer/map-scene.png", assetRoot)],
        ["glimmer/variant-1.webp", new URL("glimmer/variant-1.webp", assetRoot)],
        ["glimmer/variant-2.webp", new URL("glimmer/variant-2.webp", assetRoot)],
        ["glimmer/variant-3.webp", new URL("glimmer/variant-3.webp", assetRoot)],
        ["glimmer/map-scene.webp", new URL("glimmer/map-scene.webp", assetRoot)],
        ["lingye-together/river-from-tomorrow-opening-v3.webp", new URL("lingye-together/river-from-tomorrow-opening-v3.webp", assetRoot)],
        ["lingye-together/future-wharf-v3.webp", new URL("lingye-together/future-wharf-v3.webp", assetRoot)],
        ["lingye-together/cooperative-investigation-v3.webp", new URL("lingye-together/cooperative-investigation-v3.webp", assetRoot)],
        ["lingye-together/river-fork-v3.webp", new URL("lingye-together/river-fork-v3.webp", assetRoot)],
        ["lingye-together/ending-second-home-v3.webp", new URL("lingye-together/ending-second-home-v3.webp", assetRoot)],
        ["lingye-together/ending-quiet-harvest-v3.webp", new URL("lingye-together/ending-quiet-harvest-v3.webp", assetRoot)],
        ["lingye-together/ending-ten-thousand-bottles-v3.webp", new URL("lingye-together/ending-ten-thousand-bottles-v3.webp", assetRoot)],
        ["lingye-together/ending-river-no-address-v3.webp", new URL("lingye-together/ending-river-no-address-v3.webp", assetRoot)],
        ["lingye-together/same-kitchen-opening-v3.jpg", new URL("lingye-together/same-kitchen-opening-v3.jpg", assetRoot)],
        ["lingye-together/same-kitchen-old-recipe-v1.jpg", new URL("lingye-together/same-kitchen-old-recipe-v1.jpg", assetRoot)],
        ["lingye-together/same-kitchen-undelivered-letters-v1.jpg", new URL("lingye-together/same-kitchen-undelivered-letters-v1.jpg", assetRoot)],
        ["lingye-together/same-kitchen-service-v1.jpg", new URL("lingye-together/same-kitchen-service-v1.jpg", assetRoot)],
        ["lingye-together/same-kitchen-final-arrangement-v1.jpg", new URL("lingye-together/same-kitchen-final-arrangement-v1.jpg", assetRoot)],
        ["lingye-together/same-kitchen-ending-one-sign-v1.jpg", new URL("lingye-together/same-kitchen-ending-one-sign-v1.jpg", assetRoot)],
        ["lingye-together/same-kitchen-ending-next-door-v1.jpg", new URL("lingye-together/same-kitchen-ending-next-door-v1.jpg", assetRoot)],
        ["lingye-together/same-kitchen-ending-public-kitchen-v1.jpg", new URL("lingye-together/same-kitchen-ending-public-kitchen-v1.jpg", assetRoot)],
    ]);
    const cookingAssetDir = new URL("cooking/", assetRoot);

    return function tryServeAsset(method, parts, res) {
        const publicAsset = method === "GET" && parts[0] === "assets" ? publicAssets.get(parts.slice(1).join("/")) : undefined;
        if (publicAsset) {
            const asset = readFileSync(publicAsset);
            const contentType = publicAsset.pathname.endsWith(".webp")
                ? "image/webp"
                : publicAsset.pathname.endsWith(".jpg") || publicAsset.pathname.endsWith(".jpeg")
                  ? "image/jpeg"
                  : "image/png";
            res.writeHead(200, { "Content-Type": contentType, "Content-Length": asset.byteLength, "Cache-Control": "public, max-age=86400" });
            res.end(asset);
            return true;
        }
        const cookingAsset = method === "GET" && parts[0] === "assets" && parts[1] === "cooking"
            && ((parts.length === 3 && /^[a-z0-9-]+\.(?:webp|png)$/.test(parts[2]))
                || (parts.length === 4 && parts[2] === "dishes" && /^[a-z0-9-]+\.webp$/.test(parts[3])))
            ? new URL(parts.length === 3 ? parts[2] : `dishes/${parts[3]}`, cookingAssetDir)
            : undefined;
        if (cookingAsset && existsSync(cookingAsset)) {
            const asset = readFileSync(cookingAsset);
            const contentType = cookingAsset.pathname.endsWith(".png") ? "image/png" : "image/webp";
            res.writeHead(200, { "Content-Type": contentType, "Content-Length": asset.byteLength, "Cache-Control": "public, max-age=86400" });
            res.end(asset);
            return true;
        }
        return false;
    };
}
