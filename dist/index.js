// 入口：载入存档 → 启动开放接口。
// 没有服务端 autopilot：农场由调用接口的 AI 自己经营，作物按真实时间惰性生长。
import { assertSupportedNodeVersion } from "./runtime-version.js";
import { createFarmWorldSqlitePersistence } from "./farm-world-sqlite-persistence.js";
import { openLingyeWorldDatabase } from "./lingye-world-database.js";
import {
    MYSTERY_MERCHANT_CATALOG,
    MYSTERY_MERCHANT_SHELF_SIZE,
    renderMysteryMerchantPurchaseResult,
} from "./mystery-merchant.js";
import { load, readNatureWorld, setWorldPersistenceAdapter } from "./store.js";
import { startServer } from "./server.js";
import { readTogetherSeason3StartupSelection } from "./together-season3/activation.js";
import { activateExistingFarmWeather } from "./domain/nature/existing-farm-activation.js";
import { resumeSavedWeatherPolicy } from "./domain/nature/resume-weather.js";
assertSupportedNodeVersion();
const PORT = Number(process.env.PORT ?? 8080);
const HOST = String(process.env.HOST ?? "127.0.0.1");
const enableWeather = process.argv.includes("--activate-weather", 2);
const lingyeWorldDatabase = openLingyeWorldDatabase();
let server;
try {
    setWorldPersistenceAdapter(createFarmWorldSqlitePersistence(lingyeWorldDatabase));
    load({ settle: false });
    const now = Date.now();
    if (enableWeather) {
        const { activated } = activateExistingFarmWeather({ now });
        console.log(JSON.stringify({ weatherActivatedFarms: activated }));
    } else {
        server = startServer(PORT, HOST, {
            togetherStorySelection: readTogetherSeason3StartupSelection(),
            weatherUpgrade: resumeSavedWeatherPolicy(readNatureWorld(), now),
            lingyeWorldDatabase,
            closeLingyeWorldDatabaseOnClose: true,
            clearWorldPersistenceAdapterOnClose: true,
            mysteryMerchant: {
                catalog: MYSTERY_MERCHANT_CATALOG,
                shelfSize: MYSTERY_MERCHANT_SHELF_SIZE,
                renderPurchaseResult: renderMysteryMerchantPurchaseResult,
            },
        });
    }
} finally {
    if (!server) {
        setWorldPersistenceAdapter(null);
        if (lingyeWorldDatabase.isOpen)
            lingyeWorldDatabase.close();
    }
}
if (server) {
    for (const sig of ["SIGINT", "SIGTERM"]) {
        process.on(sig, () => {
            console.log("\n[main] 等待请求完成并退出…");
            server.close((error) => process.exit(error ? 1 : 0));
        });
    }
}
//# sourceMappingURL=index.js.map
