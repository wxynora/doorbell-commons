import { createApprovedWinterPolicy } from './winter-policy.js';

export function createApprovedWeatherPolicy({ startDay } = {}) {
    const winter = createApprovedWinterPolicy({ startDay });
    return {
        ...winter,
        plot: {
            snow: { ...winter.plot.snow, meltToMoisture: { moisturePerSnow: 1, sequence: 'weather_then_melt' } },
            moisture: { capacity: 4, wateringAmount: 1, protectDrought: true,
                weatherDelta: { sunny: -1, cloudy: 0, fog: 0, light_rain: 2, heavy_rain: 4,
                    thunderstorm: 4, hot: -2, dry_wind: -2, light_snow: 0, blizzard: 0, cold_snap: 0, freezing_rain: 0 },
                terrainAdjustments: [
                    { conditions: ['sunny', 'hot', 'dry_wind'], anyFlags: ['riverside', 'sheltered'], delta: 1 },
                    { conditions: ['dry_wind'], anyFlags: ['windy'], delta: -1 },
                ] },
        },
        catalog: {
            dry_bedding: { name: '干垫料', price: 10, currency: 'ranch_coins', description: '干垫料｜10牧场金币／份' },
            trough_cover: { name: '防冻套', price: 20, currency: 'ranch_coins', description: '防冻套｜20牧场金币／个｜使用后保护3天' },
        },
        actions: { ...winter.actions, protect_trough: { itemId: 'trough_cover', protectionDays: 3 } },
    };
}
