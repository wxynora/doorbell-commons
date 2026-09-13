import {defaultSlots,characters} from './interaction-slots.js';
/** Shared by early browser preparation and the scene's actual texture load. */
export function residentImageSource(person){
 const slot=defaultSlots.find(s=>s.slotId===person.slotId);
 const character=characters.find(c=>c.doorplate===person.doorplate);
 return slot&&character?`/lounge/poses${character.id==='du'?'':'-'+character.id}/${slot.pose}.png`:(!slot?person.avatarSrc:null);
}
