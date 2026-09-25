// Official dates: State Council 2026 holiday notice; HKO 2026/2027 calendars.
export const springFestivalHolidays=[{start:'2026-02-15',end:'2026-02-23'}];
export const winterSolsticeDates=['2026-12-22','2027-12-22'];
// Lunar festivals by official gregorian date (HKO calendars) so browsers without
// chinese-calendar Intl support still decorate correctly.
export const lunarFestivalDates={midAutumn:['2026-09-25','2027-09-15','2028-10-03','2029-09-22','2030-09-12'],chongyang:['2026-10-18','2027-10-08','2028-10-26','2029-10-16','2030-10-05'],lantern:['2026-03-03','2027-02-21','2028-02-09','2029-02-27','2030-02-16']};
const lunar=new Intl.DateTimeFormat('en-u-ca-chinese',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric'});
export function festivalForDate(now=new Date()){
 const local=new Date(now.getTime()+8*3600000),date=local.toISOString().slice(0,10),monthDay=date.slice(5);
 if(springFestivalHolidays.some(range=>date>=range.start&&date<=range.end))return 'new-year';
 if(monthDay==='10-31')return 'halloween';
 if(monthDay==='12-25')return 'christmas';
 if(winterSolsticeDates.includes(date))return 'winter';
 if(lunarFestivalDates.midAutumn.includes(date))return 'mid-autumn';
 if(lunarFestivalDates.chongyang.includes(date))return 'chongyang';
 if(lunarFestivalDates.lantern.includes(date))return 'lantern';
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
