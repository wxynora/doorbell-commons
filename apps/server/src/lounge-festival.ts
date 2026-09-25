export const loungeFestivalDescriptions = {
  "mid-autumn": "休息室换上藕粉与桂花金配色。月兔花灯泛着柔光，碎金般的桂花点缀其间；茶几上摆着切好的月饼，整间屋子浸在融融的月色里。",
  "chongyang": "休息室换上暖金与浅绿配色。各色秋菊在房中盛放，衬着素雅的草木气息；茶几上齐整地摆着刚出屉的重阳糕。",
  "winter": "休息室换上浅蓝与奶白配色。茶几上一盘热腾腾的水饺冒着白汽，柜台上的甜汤圆圆润软糯，为冬日添了满室暖意。",
  "new-year": "休息室换上喜庆的暖红配色。窗上端正地贴着福字，红灯笼与案头的梅枝相映成趣；茶几上堆着金灿灿的橘子，旁边的红包格外讨喜。",
  "lantern": "休息室换上明媚的粉紫配色。玉兔花灯与各色彩灯交错悬映，光影流转；茶几中央端放着一碗白胖滚圆的汤圆。",
  "christmas": "休息室换上典雅的红绿配色。正中的大圣诞树缀满暖黄灯串，树下错落堆着各式礼物；茶几上摆着几只造型别致的姜饼人。",
  "halloween": "休息室换上俏皮的淡紫配色。咧嘴的南瓜、晃悠的小幽灵与纸蝙蝠散布各处；柜台与茶几上盛满了五彩斑斓的节日糖果。"
} as const;

// Official dates: State Council 2026 holiday notice; HKO 2026/2027 calendars.
export const springFestivalHolidays=[{start:'2026-02-15',end:'2026-02-23'}];
export const winterSolsticeDates=['2026-12-22','2027-12-22'];
// Lunar festivals by official gregorian date (HKO calendars) so dates stay
// consistent even when Intl chinese-calendar support is unavailable.
export const lunarFestivalDates={
 midAutumn:['2026-09-25','2027-09-15','2028-10-03','2029-09-22','2030-09-12'],
 chongyang:['2026-10-18','2027-10-08','2028-10-26','2029-10-16','2030-10-05'],
 lantern:['2026-03-03','2027-02-21','2028-02-09','2029-02-27','2030-02-16'],
} as const;
const lunar=new Intl.DateTimeFormat('en-u-ca-chinese',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric'});
export function festivalForDate(now=new Date()){
 const local=new Date(now.getTime()+8*3600000),date=local.toISOString().slice(0,10),monthDay=date.slice(5);
 if(springFestivalHolidays.some(range=>date>=range.start&&date<=range.end))return 'new-year';
 if(monthDay==='10-31')return 'halloween';
 if(monthDay==='12-25')return 'christmas';
 if(winterSolsticeDates.includes(date))return 'winter';
 if((lunarFestivalDates.midAutumn as readonly string[]).includes(date))return 'mid-autumn';
 if((lunarFestivalDates.chongyang as readonly string[]).includes(date))return 'chongyang';
 if((lunarFestivalDates.lantern as readonly string[]).includes(date))return 'lantern';
 const parts=lunar.formatToParts(now),value=(type: string)=>parts.find(p=>p.type===type)?.value;
 if(value('month')==='8'&&value('day')==='15')return 'mid-autumn';
 if(value('month')==='9'&&value('day')==='9')return 'chongyang';
 if(value('month')==='1'&&value('day')==='15')return 'lantern';
 return 'ordinary';
}

export function loungeFestivalDescription(now = new Date()): string | null {
  const kind = festivalForDate(now);
  return kind === 'ordinary' ? null : loungeFestivalDescriptions[kind];
}
