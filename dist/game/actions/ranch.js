import { buyAnimalForPartner, buyPatrolGoose, buyPetForPartner, farmSendRanch, ranchFeedAnimal } from "../../engine.js";
import { animalById, petById } from "../../content.js";
import { RANCH_PATROL_GOOSE_NAME } from "../../config.js";
import { humanDisplay, withFooter } from "../presentation/farm.js";
import { viewLedger } from "../presentation/shop.js";

export function handleRanchAction(action, f, b, now) {
    switch (action) {
        case "buy-animal": { // 买一只已解锁的动物送给伴侣（机→人；动物进牧场，AI 看不到牧场内部，只在 ledger 记一笔）
            const aid = String(b.id ?? b.animal ?? "");
            const r = buyAnimalForPartner(f, aid, now);
            const who = humanDisplay(f);
            const tag = animalById.get(aid)?.emoji ? animalById.get(aid).emoji + " " : "🐾 "; // 配得上 emoji 就用，配不上回落 🐾
            return { ok: r.ok, text: r.ok ? withFooter(f, now, `${tag}你把一只${r.name}送给了${who}（-${r.cost}金）。\n从现在起，${who}会在牧场里替你养着它——照料、收获，偶尔还会掉一瓶加速药水悄悄进你的仓库。`) : r.error };
        }
        case "buy-pet": { // 买一只已解锁的宠物送给伴侣（机→人；不产出，给农场温和 buff，伴侣养/改名/打扮）
            const pid = String(b.id ?? b.pet ?? "");
            const r = buyPetForPartner(f, pid, now);
            const who = humanDisplay(f);
            const k = petById.get(pid);
            const tag = k?.emoji ? k.emoji + " " : "🐾 ";
            return { ok: r.ok, text: r.ok ? withFooter(f, now, `${tag}你把一只${r.name}送给了${who}（-${r.cost}金）。\n${who}会替你养着它、给它起名打扮——它不产东西，只是常在田里转悠陪着你，${k?.buffText ?? ""}`) : r.error };
        }
        case "buy-patrol-goose": {
            const r = buyPatrolGoose(f, now);
            const who = humanDisplay(f);
            return { ok: r.ok, text: r.ok ? withFooter(f, now, `🪿 你给${who}的牧场请来了一只${RANCH_PATROL_GOOSE_NAME}（-${r.cost}金）。\n它会常驻牧场巡逻；遇到未被人类先抓住的偷金币动物，有 25% 概率自动赶走，每天最多成功 3 次。`) : r.error };
        }
        case "send-ranch": {
            const r = farmSendRanch(f, Number(b.amount), now);
            const who = humanDisplay(f);
            return { ok: r.ok, text: r.ok ? withFooter(f, now, `💌 你给${who}的牧场寄去了 ${r.amount} 金（主农场还剩 ${r.farmLeft} 金；牧场现有 ${r.ranchCoins} 金）。`) : r.error };
        }
        case "ranch-feed": {
            const r = ranchFeedAnimal(f, b.animal ?? b.animalIdx ?? b.id, now);
            return { ok: r.ok, text: r.ok ? withFooter(f, now, `🥣 给${r.animal}投喂成功，-🪙${r.cost}；下一份正常产物 +10%，今天还可投喂 ${r.left} 次。`) : r.error };
        }
        case "ledger": return { ok: true, text: viewLedger(f) }; // 看机⇄人金币往来 + 药水入库（牧场内部看不到）
    }
}
