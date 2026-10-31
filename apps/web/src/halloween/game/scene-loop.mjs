// Render only while a scene changes. Hidden pages never advance or draw.
export class SceneLoop {
 constructor(draw){this.draw=draw;this.frame=null;this.disposed=false;this.run=now=>{this.frame=null;if(this.disposed||document.hidden)return;if(this.draw(now))this.request();};this.visible=()=>{if(document.hidden){cancelAnimationFrame(this.frame);this.frame=null;}else this.request();};document.addEventListener('visibilitychange',this.visible);}
 request(){if(!this.disposed&&!document.hidden&&this.frame===null)this.frame=requestAnimationFrame(this.run);}
 dispose(){this.disposed=true;cancelAnimationFrame(this.frame);document.removeEventListener('visibilitychange',this.visible);}
}
