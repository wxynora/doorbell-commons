export const MINIMUM_NODE_VERSION = Object.freeze({ major: 22, minor: 16, patch: 0 });

export function assertSupportedNodeVersion(version = process.versions.node) {
    const match = /^(\d+)\.(\d+)\.(\d+)/u.exec(String(version));
    if (!match) {
        throw new Error(`Unsupported Node.js version: ${version}`);
    }
    const actual = match.slice(1, 4).map(Number);
    const minimum = [
        MINIMUM_NODE_VERSION.major,
        MINIMUM_NODE_VERSION.minor,
        MINIMUM_NODE_VERSION.patch,
    ];
    for (let index = 0; index < minimum.length; index += 1) {
        if (actual[index] > minimum[index])
            return;
        if (actual[index] < minimum[index]) {
            throw new Error(`Node.js >=22.16.0 is required; current version is ${version}`);
        }
    }
}
