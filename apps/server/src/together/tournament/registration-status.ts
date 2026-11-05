import {SNOW_TOURNAMENT_REGISTRATION_COPY} from './registration-bell.js';

type Registration={phase:string;registrationOpenAt:string;registrationCloseAt:string;enrollments:{id:string}[]};
export function decorateRegistrationStatus(text:string,state:Registration|null,residentId:string,now:number):string {
  if(!state || state.phase!=='registration' || now<Date.parse(state.registrationOpenAt) || now>=Date.parse(state.registrationCloseAt))return text;
  if(text.includes(SNOW_TOURNAMENT_REGISTRATION_COPY))return text;
  const enrolled=state.enrollments.some(member=>member.id===residentId);
  const notice=SNOW_TOURNAMENT_REGISTRATION_COPY+(enrolled?'（你已报名）':'')+'\n'+JSON.stringify({op:'game.snow.view',args:{}});
  const lines=text.split('\n'),daily=lines.findIndex(line=>line.includes('日报'));
  lines.splice(daily<0?lines.length:daily+1,0,notice);return lines.join('\n');
}
