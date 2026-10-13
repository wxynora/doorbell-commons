# PyMahjongGB

- Upstream: https://github.com/ailab-pku/PyMahjongGB
- Upstream revision: `bb404f3f3480c2569e14d54043ad06e366e128df`
- Upstream package version: `PyMahjongGB 1.4.0`
- License: MIT (see `LICENSE`); the embedded `mahjong-algorithm` sources are
  also MIT licensed (see `MahjongGB/mahjong-algorithm/LICENSE`).

## Runtime and build

The application imports the upstream native module as `MahjongGB` and calls
`MahjongFanCalculator` for every win/fan decision and `MahjongShanten` for
shanten information. `requirements.txt` installs this directory as a local
source distribution. Its locally adapted `setup.py` compiles
`MahjongGB/mahjong.cpp`, `fan_calculator.cpp`, and `shanten.cpp` as a C++
CPython extension, so a C++ compiler and Python development headers are build
requirements.

Verified in this worktree with CPython 3.10.12 and GCC/G++ 11.4.0 using:

```text
cd third_party/pymahjonggb
python setup.py build_ext \
  --build-lib /tmp/pymahjonggb-runtime \
  --build-temp /tmp/pymahjonggb-build
PYTHONPATH=/tmp/pymahjonggb-runtime \
  python tests/test.py
```

## Local changes

The build metadata is adapted for local CPython builds. The native calculator,
Python binding and type stub now expose optional `dazhong=False`; the default
retains the original MCR behavior for saved hands. The added `dazhong_fan.h`
profile follows Tencent classic friend-room150's structural fan table and
removes MCR-only contextual bonuses before choosing the maximum-fan form.
It preserves native non-duplication rules, keeps a single-pair wait after
removing All Melded, and recognizes seven distinct honor pairs as Big Seven
Stars. Tencent's names/points are rule facts, not copied executable code.

Rule evidence: official Android8.19.111 `ModuleFanConfig` (rows264..334,
game type150), `MJGameBaseConfig`, `PrivateRoomSettingConfig`, and the
in-package flower rules. Source entry:
https://majiang.qq.com/zlkdatasys/mct/d/play.shtml?device=Android

MIT license files and upstream attribution remain intact. The binding uses
CPython's stable ABI from 3.10 (`Py_LIMITED_API=0x030A0000`); tuple and UTF-8
access use the corresponding public functions. Local source installation
requires Python 3.10 or newer.

The Main artifact builder invokes `deploy/scripts/build-mahjong-native.sh`
on an isolated official manylinux2014 Docker runner, with networking disabled
during compilation. The Linux library and platform/profile manifest are bundled
under `games/mahjong/native`, independently of the VPS's installed Python
packages. Default target is linux/amd64; linux/arm64 is explicit through
`DOORBELL_NATIVE_PLATFORM`. No macOS binary or build cache is published.
The actual configured Python verifies this release's DaZhong and legacy MCR
interfaces before lounge startup. Runtime replacement and rollback therefore
select the library together with the rules, without changing the shared venv.

Verified locally with Linux x86_64 / CPython 3.10.22 and macOS arm64 /
CPython 3.14.3. An original upstream-format 1.4.0 binary was rejected because
it does not support `dazhong`; the version number alone is not compatibility
proof. This candidate has not been deployed.

Stable ABI reference: https://docs.python.org/3/c-api/stable.html
