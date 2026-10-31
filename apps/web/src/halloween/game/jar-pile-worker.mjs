import {settleJarCandies} from './jar-candy-pile.mjs';
self.onmessage=({data:{id,parameters}})=>{
  try{self.postMessage({id,poses:settleJarCandies(parameters)});}
  catch(error){self.postMessage({id,error:error.message});}
};
