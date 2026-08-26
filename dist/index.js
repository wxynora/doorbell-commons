// 入口：载入存档 → 启动开放接口。
// 没有服务端 autopilot：农场由调用接口的 AI 自己经营，作物按真实时间惰性生长。
import { assertSupportedNodeVersion } from "./runtime-version.js";
import { load, save } from "./store.js";
import { startServer } from "./server.js";
assertSupportedNodeVersion();
const PORT = Number(process.env.PORT ?? 8080);
const HOST = String(process.env.HOST ?? "127.0.0.1");
load();
startServer(PORT, HOST);
for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
        console.log("\n[main] 保存并退出…");
        save();
        process.exit(0);
    });
}
//# sourceMappingURL=index.js.map
