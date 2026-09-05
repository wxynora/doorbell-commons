import pupu from "./assets/pupu-watercolor-20260905.webp?url";
import modian from "./assets/modian-watercolor-20260905.webp?url";
import liyuan from "./assets/liyuan-watercolor-20260905.webp?url";
import songmo from "./assets/songmo.webp?url";
import beiheng from "./assets/beiheng-watercolor-20260905.webp?url";
import { npcGiftArtwork } from "./gift-artwork";

/** URL imports emit versioned assets; scene.ts assigns src only to visible artwork. */
export const npcArtwork = {
  portraits: { npc_pupu: pupu, npc_modian: modian, npc_liyuan: liyuan, npc_songmo: songmo, npc_beiheng: beiheng },
  gifts: npcGiftArtwork,
};
