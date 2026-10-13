#!/usr/bin/env bash
# Build on the publisher's isolated Linux runner; never compile on the VPS.
set -Eeuo pipefail
[[ $# -eq 2 ]] || { echo 'usage: build-mahjong-native <source-root> <native-output>' >&2; exit 1; }
source_root="$(cd "$1" && pwd)"
mkdir -p "$2"
native_output="$(cd "$2" && pwd)"
target_platform="${DOORBELL_NATIVE_PLATFORM:-linux/amd64}"
case "${target_platform}" in
  linux/amd64) image=quay.io/pypa/manylinux2014_x86_64 ;;
  linux/arm64) image=quay.io/pypa/manylinux2014_aarch64 ;;
  *) echo 'Mahjong native build requires linux/amd64 or linux/arm64' >&2; exit 1 ;;
esac
command -v docker >/dev/null || { echo 'Docker Linux builder is required for Mahjong native artifact' >&2; exit 1; }
docker run --rm --platform "${target_platform}" --network none -i \
  --mount "type=bind,src=${source_root},dst=/source,readonly" \
  --mount "type=bind,src=${native_output},dst=/output" \
  "${image}" bash -Eeuo pipefail -s <<'BUILD'
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cp -a /source/games/mahjong/third_party/pymahjonggb/. "$work/"
/opt/python/cp311-cp311/bin/python - "$work" <<'COMPILE'
import subprocess,sys,sysconfig
from pathlib import Path
package=Path(sys.argv[1])
sources=['MahjongGB/mahjong.cpp','MahjongGB/mahjong-algorithm/fan_calculator.cpp','MahjongGB/mahjong-algorithm/shanten.cpp']
subprocess.run(['g++','-shared','-fPIC','-O2','-std=c++11','-static-libstdc++','-static-libgcc',
    '-DPy_LIMITED_API=0x030A0000','-I'+sysconfig.get_path('include'),
    '-o','/output/MahjongGB.abi3.so',*[str(package/p) for p in sources]],check=True)
COMPILE
test -f /output/MahjongGB.abi3.so
mkdir -p "$work/runtime/games/mahjong"
ln -s /output "$work/runtime/games/mahjong/native"
/opt/python/cp310-cp310/bin/python /source/deploy/scripts/verify-mahjong-native.py "$work/runtime"
/opt/python/cp310-cp310/bin/python - <<'MANIFEST'
import json,platform
from pathlib import Path
Path('/output/manifest.json').write_text(json.dumps({'schema':1,'platform':'linux','machine':platform.machine(),
    'abi':'abi3','minimum_python':'3.10','profile':'dazhong-friend-144-v1'})+'\n')
MANIFEST
chmod 755 /output/MahjongGB.abi3.so
chmod 644 /output/manifest.json
BUILD
