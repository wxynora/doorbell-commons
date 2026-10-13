// Doorbell profile for Tencent classic DaZhong friend rooms (game type 150).
// Source: official Android 8.19.111, ModuleFanConfig rows 264..334 and
// PrivateRoomSettingConfig: no minimum, no wild tiles, no birds. This profile
// uses the existing structural detectors and their non-duplication rules;
// contextual MCR-only fans must not influence the winning decomposition.
#ifndef DOORBELL_DAZHONG_FAN_H
#define DOORBELL_DAZHONG_FAN_H

namespace mahjong {
static const fan_t dazhong_structural_fans[] = {
    CHICKEN_HAND,
    PURE_DOUBLE_CHOW,
    MIXED_DOUBLE_CHOW,
    SHORT_STRAIGHT,
    TWO_TERMINAL_CHOWS,
    PUNG_OF_TERMINALS_OR_HONORS,
    MELDED_KONG,
    ONE_VOIDED_SUIT,
    NO_HONORS,
    EDGE_WAIT,
    CLOSED_WAIT,
    SINGLE_WAIT,
    DRAGON_PUNG,
    ALL_CHOWS,
    TILE_HOG,
    DOUBLE_PUNG,
    TWO_CONCEALED_PUNGS,
    CONCEALED_KONG,
    ALL_SIMPLES,
    OUTSIDE_HAND,
    TWO_MELDED_KONGS,
    LAST_TILE,
    ALL_PUNGS,
    HALF_FLUSH,
    MIXED_SHIFTED_CHOWS,
    ALL_TYPES,
    TWO_CONCEALED_KONGS,
    TWO_DRAGONS_PUNGS,
    MIXED_STRAIGHT,
    REVERSIBLE_TILES,
    MIXED_TRIPLE_CHOW,
    MIXED_SHIFTED_PUNGS,
    LESSER_HONORS_AND_KNITTED_TILES,
    KNITTED_STRAIGHT,
    UPPER_FOUR,
    LOWER_FOUR,
    BIG_THREE_WINDS,
    PURE_STRAIGHT,
    THREE_SUITED_TERMINAL_CHOWS,
    PURE_SHIFTED_CHOWS,
    ALL_FIVE,
    TRIPLE_PUNG,
    THREE_CONCEALED_PUNGS,
    SEVEN_PAIRS,
    GREATER_HONORS_AND_KNITTED_TILES,
    ALL_EVEN_PUNGS,
    FULL_FLUSH,
    PURE_SHIFTED_PUNGS,
    PURE_TRIPLE_CHOW,
    UPPER_TILES,
    MIDDLE_TILES,
    LOWER_TILES,
    FOUR_PURE_SHIFTED_CHOWS,
    THREE_KONGS,
    ALL_TERMINALS_AND_HONORS,
    FOUR_PURE_SHIFTED_PUNGS,
    QUADRUPLE_CHOW,
    ALL_TERMINALS,
    LITTLE_FOUR_WINDS,
    LITTLE_THREE_DRAGONS,
    ALL_HONORS,
    FOUR_CONCEALED_PUNGS,
    PURE_TERMINAL_CHOWS,
    BIG_FOUR_WINDS,
    BIG_THREE_DRAGONS,
    ALL_GREEN,
    NINE_GATES,
    FOUR_KONGS,
    SEVEN_SHIFTED_PAIRS,
    THIRTEEN_ORPHANS,
    BIG_SEVEN_STARS,
};

static void prepare_dazhong_context(fan_table_t &table, win_flag_t flag) {
    table[CONCEALED_HAND] = table[FULLY_CONCEALED_HAND] = table[MELDED_HAND] = 0;
    table[PREVALENT_WIND] = table[SEAT_WIND] = 0;
    table[LAST_TILE_DRAW] = table[LAST_TILE_CLAIM] = table[ROBBING_THE_KONG] = 0;
    // The friend-room additive options are +1 for self draw and +8 for a
    // kong replacement win. A flower replacement is NOT a kong replacement.
    table[SELF_DRAWN] = (flag & WIN_FLAG_SELF_DRAWN) && !(flag & WIN_FLAG_KONG_INVOLVED);
    table[OUT_WITH_REPLACEMENT_TILE] = (flag & WIN_FLAG_SELF_DRAWN) && (flag & WIN_FLAG_KONG_INVOLVED);
#if SUPPORT_CONCEALED_KONG_AND_MELDED_KONG
    if (table[CONCEALED_KONG_AND_MELDED_KONG]) {
        table[CONCEALED_KONG_AND_MELDED_KONG] = 0;
        table[CONCEALED_KONG] = table[MELDED_KONG] = 1;
    }
#endif
}

static void finish_dazhong_table(fan_table_t &table, win_flag_t flag, bool seven_honors) {
    prepare_dazhong_context(table, flag);
    if (seven_honors && table[SEVEN_PAIRS] && table[ALL_HONORS]) {
        // Seven DISTINCT honor pairs: repeats cannot qualify as Big Seven Stars.
        std::fill(std::begin(table), std::end(table), 0);
        table[BIG_SEVEN_STARS] = 1;
        prepare_dazhong_context(table, flag);
    }
    bool structural = false;
    for (fan_t fan : dazhong_structural_fans) {
        if (fan != CHICKEN_HAND && table[fan]) structural = true;
    }
    table[CHICKEN_HAND] = structural ? 0 : 1;
}

static int dazhong_fan_value(int fan) {
    return fan == CHICKEN_HAND ? 1 : fan_value_table[fan];
}
}
#endif
