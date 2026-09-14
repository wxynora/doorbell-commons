// Official dates: State Council 2026 holiday notice; HKO 2026/2027 calendars.
export const springFestivalHolidays=[{start:'2026-02-15',end:'2026-02-23'}];
export const winterSolsticeDates=['2026-12-22','2027-12-22'];
const lunar=new Intl.DateTimeFormat('en-u-ca-chinese',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric'});
export function festivalForDate(now=new Date()){
 const local=new Date(now.getTime()+8*3600000),date=local.toISOString().slice(0,10),monthDay=date.slice(5);
 if(springFestivalHolidays.some(range=>date>=range.start&&date<=range.end))return 'new-year';
 if(monthDay==='10-31')return 'halloween';
 if(monthDay==='12-25')return 'christmas';
 if(winterSolsticeDates.includes(date))return 'winter';
 const parts=lunar.formatToParts(now),value=type=>parts.find(p=>p.type===type)?.value;
 if(value('month')==='8'&&value('day')==='15')return 'mid-autumn';
 if(value('month')==='9'&&value('day')==='9')return 'chongyang';
 if(value('month')==='1'&&value('day')==='15')return 'lantern';
 return 'ordinary';
}
export function nextFestivalChange(now=new Date()){
 const day=86400000,offset=8*3600000;
 return Math.floor((now.getTime()+offset)/day)*day+day-offset;
}
