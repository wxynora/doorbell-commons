import { neighborhoodWeatherTerrain } from "./neighborhood.js";

export function farmAmbience(farm, condition) {
    if (condition === "light_rain")
        return "雨点轻轻敲着檐口，田埂的颜色深了一点。";
    if (condition === "fog" && neighborhoodWeatherTerrain(farm.id).riverside)
        return "薄雾贴着河面，桥那头的屋檐只露出一点轮廓。";
    if (farm.plots?.some(plot => plot.lingyeWeatherUpgrade?.snow > 0))
        return "篱笆脚下还积着雪，院子里安静了许多。";
    return null;
}
