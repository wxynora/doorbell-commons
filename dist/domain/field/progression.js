import { TICK_MS } from '../../config.js';
import { agronomyGrowthEffect } from '../../career/p3-world.js';
import { advanceRanch } from '../ranch/progression.js';

// Settle elapsed ticks under the state that actually held before the next
// weather transition. Both lazy actions and daily nature advancement use it.
export function advanceFarmGrowth(farm, now, onChanged) {
    const elapsed = Math.floor((now - farm.lastTickAt) / TICK_MS);
    if (elapsed <= 0) return 0;
    for (const plot of farm.plots) {
        if (!plot.crop || plot.crop.ripe) continue;
        const effect = agronomyGrowthEffect(plot);
        let ticks = elapsed;
        if (effect === 'paused') ticks = 0;
        else if (effect === 'half') {
            const accumulated = (plot.crop.lingyeGrowthRemainder ?? 0) + elapsed;
            ticks = Math.floor(accumulated / 2);
            plot.crop.lingyeGrowthRemainder = accumulated % 2;
        }
        plot.crop.progress = Math.min(plot.crop.growTicks, plot.crop.progress + ticks);
        if (plot.crop.progress >= plot.crop.growTicks) plot.crop.ripe = true;
    }
    advanceRanch(farm, elapsed);
    farm.lastTickAt += elapsed * TICK_MS;
    onChanged?.(farm.id);
    return elapsed;
}
