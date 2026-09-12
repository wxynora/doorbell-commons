# Third-party code

Required Notice: Copyright (c) 2026 南山君 (https://github.com/Zizuixixiang/cedarduet)

Mahjong game implementation derived from CedarDuet commit
c44cb1af8f75bd23dc005fb0f1288c8b5368143b, app/games/mahjong.py.
Licensed under PolyForm Noncommercial 1.0.0; see THIRD_PARTY_LICENSE.
Retained the game algorithm, legal actions, native fan calculation and private/public projections.
Removed wallet settlement, resignation policy, model rule prompts and truncated NPC history.
Replaced the generic room plugin base with the minimal result container required locally.
No upstream room/account/MCP/model runtime is included.

Native dependency: PyMahjongGB 1.4.0, CedarDuet-vendored revision
bb404f3f3480c2569e14d54043ad06e366e128df. MIT licenses and notice are under
third_party/pymahjonggb. Native sources are unmodified.
