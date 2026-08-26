import { inspectFarmAssetCoverage } from "../src/farm/farm-asset-coverage.ts";

const report = inspectFarmAssetCoverage();
console.log(
  `farm asset coverage: ${report.declarations} declarations, ${report.sourceFiles} source files`,
);
console.log(`farm asset status: ${JSON.stringify(report.statusCounts)}`);
