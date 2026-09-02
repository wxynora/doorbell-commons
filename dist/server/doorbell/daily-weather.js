import { MAX_BODY_BYTES } from "../../config.js";
import { beijingDate, beijingTimestamp } from "../../career/persistence.js";
import { beijingDayStart, natureSnapshot } from "../../nature.js";
import { PublicSyncError } from "../../public-sync.js";
import { getNatureWorld } from "../../store.js";
import { jsonOut, readJsonBody } from "../http.js";
import { internalServiceError, isPlainObject, requireDoorbellService } from "./contract.js";

const WEATHER_NAMES = Object.freeze({
    sunny: "晴", cloudy: "多云", light_rain: "小雨", heavy_rain: "暴雨",
    thunderstorm: "雷暴", fog: "雾", hot: "高温", dry_wind: "干热风",
    light_snow: "小雪", blizzard: "暴雪",
});

export function dailyWeatherForecast(world, issueDate) {
    const snapshot = natureSnapshot(world, beijingTimestamp(issueDate, 9));
    if (snapshot.status !== "active")
        return null;
    return {
        title: "未来三日天气预报",
        body: snapshot.forecast.slice(1).map((entry) =>
            `${beijingDate(beijingDayStart(entry.dayIndex))}（${entry.season}季第 ${entry.seasonDay} 天）：${WEATHER_NAMES[entry.condition]}。`)
            .join("\n"),
    };
}

export async function handleDoorbellDailyWeather(req, res, method) {
    if (!requireDoorbellService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!isPlainObject(body) || Object.keys(body).length !== 1 ||
            typeof body.issue_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(body.issue_date))
            return internalServiceError(res, 400, "invalid_request", "The daily weather request is invalid");
        const at = beijingTimestamp(body.issue_date, 9);
        if (!Number.isSafeInteger(at) || beijingDate(at) !== body.issue_date)
            return internalServiceError(res, 400, "invalid_request", "The daily weather issue date is invalid");
        return jsonOut(res, 200, {
            ok: true,
            data: { weather_forecast: dailyWeatherForecast(getNatureWorld(), body.issue_date) },
        });
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return internalServiceError(res, 400, "invalid_request", "The request body must be valid JSON");
        console.error("[doorbell-lingye-daily] authoritative weather read failed");
        return internalServiceError(res, 503, "service_unavailable", "The daily weather is unavailable");
    }
}
