export interface GameContextCursor { eventSequence:number; chatSequence:number }
/** Internal receipt metadata; never part of the model-visible message. */
export interface GameContextDelivery { after:GameContextCursor; captured?:GameContextCursor }
