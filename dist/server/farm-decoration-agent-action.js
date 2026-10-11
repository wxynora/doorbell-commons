import {replaceFarm,getNatureWorld} from '../store.js';
import {natureSnapshot} from '../nature.js';
import {decorationResource,decorationState,decorationRevision} from '../domain/farm-decoration/state.js';
import {createDecorationAction} from '../domain/farm-decoration/decorate-action.js';

export const handleFarmDecorationAction=createDecorationAction({
  resourceOf:farm=>({...decorationResource(farm),season:natureSnapshot(structuredClone(getNatureWorld()),Date.now()).season?.id}),
  stateOf:decorationState,revisionOf:decorationRevision,commit:replaceFarm,
});
