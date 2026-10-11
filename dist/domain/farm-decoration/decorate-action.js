import {randomUUID,createHash} from 'node:crypto';
import {createDecorationDraft,reviseDecorationDraft,evaluateDecorationDraft} from './decorate-draft.js';
import {decorationViewText,decorationSummary,decorationIssuesText} from './decorate-receipt.js';
import {createMinimalHumanActionReceipt,replayMinimalHumanActionReceipt} from '../../minimal-action-receipt.js';

const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const canonical=v=>Array.isArray(v)?v.map(canonical):record(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const fingerprint=params=>createHash('sha256').update(JSON.stringify(canonical(params))).digest('hex');
const response=(ok,text)=>({status:ok?200:400,json:{ok,text}});
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// The injected adapters share the existing Farm connection and atomic replaceFarm commit.
// No separate database, timer, auto-purchase, stock mutation or environment advancement.
export function createDecorationAction({resourceOf,stateOf,revisionOf,commit,uuid=randomUUID}){
  return function decorate(farm,params){
    const resource=resourceOf(farm);
    if(!record(params))return response(false,'参数必须是对象；空参数查看农场布局。');
    const unexpected=Object.keys(params).filter(k=>!['changes','draft','fixes','preview','reset'].includes(k));
    if(unexpected.length)return response(false,`多了字段${unexpected.join('、')}；可用changes、draft、fixes、preview、reset。`);
    if(Object.keys(params).length===0){
      const pending=Object.keys(farm.doorbellFarmDecorationDrafts??{});
      return response(true,[decorationViewText(farm,resource),...pending.map(id=>`草稿编号：${id}（尚未保存）`),
        ...(farm.doorbellLastDecorationReceipt?[`最近保存的草稿编号：${farm.doorbellLastDecorationReceipt}`]:[])].join('\n'));
    }
    if(params.preview!==undefined&&typeof params.preview!=='boolean')return response(false,'preview必须是true或false。');
    if(params.draft!==undefined&&(typeof params.draft!=='string'||!idPattern.test(params.draft)))return response(false,`草稿编号“${String(params.draft)}”无效；请原样使用回执中的编号。`);
    if(params.changes!==undefined&&(!Array.isArray(params.changes)||!params.changes.length))return response(false,'changes必须是非空的调整列表。');
    if(params.fixes!==undefined&&!Array.isArray(params.fixes))return response(false,'fixes必须是列表。');
    if(params.reset!==undefined&&(typeof params.reset!=='boolean'||params.draft!==undefined||params.fixes!==undefined))
      return response(false,'reset必须是true或false，且不能与draft或fixes一起提交。');
    const receipts=farm.doorbellHumanFarmDecorationReceipts??{},saved=params.draft?receipts[params.draft]:null;
    if(saved?.result?.kind==='farm.decorate'){
      if(Object.keys(params).some(k=>k!=='draft')&&!replayMinimalHumanActionReceipt(saved,fingerprint(params),{data:{result:null}}))
        return response(false,`草稿${params.draft}已经保存，不能再替换其中事项；空参数查看现有布局后提交新的changes。`);
      return response(true,`装修已保存。\n草稿编号：${params.draft}\n${saved.result.summary}\n${decorationViewText(farm,resource)}`);
    }
    const pending=params.reset===true?{}:farm.doorbellFarmDecorationDrafts??{};
    if(params.reset===true&&!params.changes){
      const working=structuredClone(farm);delete working.doorbellFarmDecorationDrafts;
      commit(farm.id,working);
      return response(true,`未保存的装修草稿已放弃，已保存布局未改动。\n${decorationViewText(farm,resource)}`);
    }
    // Object insertion order is persisted; move a revised draft to the end below.
    // No timeout, implicit expiry or unrequested baseline rebase.
    let draft,id=params.draft??Object.keys(pending).at(-1);
    if(id){
      draft=pending[id];if(!draft)return response(false,`没有找到草稿“${id}”；空参数查看已保留的草稿编号和最近保存结果。`);
      try{draft=reviseDecorationDraft(draft,{fixes:params.fixes??[],changes:params.changes??[]});}
      catch{
        const fixes=params.fixes??[],ids=draft.entries.map(e=>e.id);
        return response(false,`草稿编号：${id}\nfixes须为{id,change}且id不能重复；这份草稿的事项编号：${ids.join('、')}。提交值：${JSON.stringify(fixes)}。原草稿未改动。`);
      }
    }else{
      if(params.fixes!==undefined)return response(false,'没有未保存的装修草稿；请先用changes开始布置。');
      if(!params.changes)return response(false,'请提供changes；空参数查看农场布局。');
      id=uuid();
      draft=createDecorationDraft(resource,params.changes);
    }
    const revision=revisionOf(farm),result=evaluateDecorationDraft(farm,resource,draft,{uuid});
    const working=structuredClone(farm);
    working.doorbellFarmDecorationDrafts=Object.fromEntries([...Object.entries(pending).filter(([key])=>key!==id),[id,result.draft]]);
    if(!result.ok||params.preview===true){
      // Persist before acknowledging retention; a commit failure escapes as a service fault.
      commit(farm.id,working);
      return result.ok?response(true,`装修预览，尚未保存。\n草稿编号：${id}\n${decorationSummary(result.draft)}\n${decorationViewText(farm,{...resource,layout:result.layout})}`):
        response(false,decorationIssuesText(id,result.issues,resource));
    }
    if(revisionOf(farm)!==revision)throw Error('Decoration authority changed during synchronous save');
    working.farmDecorations={...stateOf(farm),layout:result.layout};
    const stable={kind:'farm.decorate',draft:id,summary:decorationSummary(result.draft)};
    working.doorbellHumanFarmDecorationReceipts={...receipts,[id]:createMinimalHumanActionReceipt(fingerprint(params),{data:{result:stable}})};
    delete working.doorbellFarmDecorationDrafts[id];
    if(Object.keys(working.doorbellFarmDecorationDrafts).length===0)delete working.doorbellFarmDecorationDrafts;
    working.doorbellLastDecorationReceipt=id;
    commit(farm.id,working);
    return response(true,`装修已保存。\n草稿编号：${id}\n${stable.summary}\n${decorationViewText(farm,resourceOf(farm))}`);
  };
}
