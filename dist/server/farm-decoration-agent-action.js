import {replaceFarm} from '../store.js';
import {decorationResource,decorationState,decorationRevision} from '../domain/farm-decoration/state.js';
import {createDecorationAction} from '../domain/farm-decoration/decorate-action.js';

export const handleFarmDecorationAction=createDecorationAction({
  resourceOf:decorationResource,stateOf:decorationState,revisionOf:decorationRevision,commit:replaceFarm,
});
