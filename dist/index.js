// 入口：载入存档 → 启动开放接口。
// 没有服务端 autopilot：农场由调用接口的 AI 自己经营，作物按真实时间惰性生长。
import { assertSupportedNodeVersion } from "./runtime-version.js";
import { createFarmWorldSqlitePersistence } from "./farm-world-sqlite-persistence.js";
import { openLingyeWorldDatabase } from "./lingye-world-database.js";
import { load, save, setWorldPersistenceAdapter } from "./store.js";
import { startServer } from "./server.js";
assertSupportedNodeVersion();
const PORT = Number(process.env.PORT ?? 8080);
const HOST = String(process.env.HOST ?? "127.0.0.1");
const lingyeWorldDatabase = openLingyeWorldDatabase();
let server;
try {
    setWorldPersistenceAdapter(createFarmWorldSqlitePersistence(lingyeWorldDatabase));
    load();
    server = startServer(PORT, HOST, {
        lingyeWorldDatabase,
        closeLingyeWorldDatabaseOnClose: true,
        clearWorldPersistenceAdapterOnClose: true,
    });
}
catch (error) {
    setWorldPersistenceAdapter(null);
    if (lingyeWorldDatabase.isOpen)
        lingyeWorldDatabase.close();
    throw error;
}
for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
        console.log("\n[main] 保存并退出…");
        let exitCode = 0;
        try {
            save();
        }
        catch (error) {
            exitCode = 1;
            console.error("[main] 退出前保存失败:", error);
        }
        server.close((error) => process.exit(error || exitCode ? 1 : 0));
    });
}
//# sourceMappingURL=index.js.map
