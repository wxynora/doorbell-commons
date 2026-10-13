#!/usr/bin/env python3
"""Validate the deployed native API with the lounge's configured interpreter."""
import json
from pathlib import Path
import platform
import sys


def verify(root):
    if sys.version_info < (3, 10):
        raise RuntimeError('Mahjong native runtime requires CPython 3.10 or newer')
    native = root / 'games/mahjong/native'
    if native.exists():
        sys.path.insert(0, str(native))
    import MahjongGB
    if native.exists() and Path(MahjongGB.__file__).resolve().parent != native.resolve():
        raise RuntimeError('Mahjong native module was not loaded from this release')
    calc = MahjongGB.MahjongFanCalculator
    args = dict(pack=(('CHI', 'W3', 1),),
        hand=('B3', 'B4', 'T6', 'T7', 'T8', 'W6', 'W6', 'W6', 'J1', 'J1'),
        winTile='B5', flowerCount=0, isSelfDrawn=False, is4thTile=False,
        isAboutKong=False, isWallLast=False, seatWind=0, prevalentWind=0, verbose=True)
    modern = calc(**args, dazhong=True)
    legacy = calc(**args, dazhong=False)
    if modern != ((1, 1, '鸡胡', 'Chicken Hand'),) or legacy != ((8, 1, '无番和', 'Chicken Hand'),):
        raise RuntimeError('Mahjong native DaZhong/MCR rule profile does not match this release')
    # Validate another entry point used by every hand projection.
    if not isinstance(MahjongGB.MahjongShanten((), ('W1',)*3+('B2',)*3+('T3',)*3+('J1',)*3+('F1',)), int):
        raise RuntimeError('Mahjong native shanten API is incompatible')
    return {'profile':'dazhong-friend-144-v1', 'machine':platform.machine(), 'python':platform.python_version(),
            'module':str(Path(MahjongGB.__file__).resolve()), 'dazhong_chicken':1, 'legacy_chicken':8}


if __name__ == '__main__':
    try:
        print(json.dumps(verify(Path(sys.argv[1]).resolve()), ensure_ascii=False))
    except Exception as error:
        # This is an installation error, never a legal-hand/no-win result.
        raise SystemExit(f'Mahjong native compatibility check failed: {error}')
