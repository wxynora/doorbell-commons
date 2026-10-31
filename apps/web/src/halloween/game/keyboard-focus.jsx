export function KeyboardFocusMarker({canvas, target}) {
  const element=canvas.current;
  if(!element||!target?.bounds)return null;
  const {left,top,right,bottom}=target.bounds;
  return <span aria-hidden="true" style={{position:'absolute',pointerEvents:'none',zIndex:4,
    left:element.offsetLeft+left*element.offsetWidth,top:element.offsetTop+top*element.offsetHeight,
    width:Math.max(0,(right-left)*element.offsetWidth),height:Math.max(0,(bottom-top)*element.offsetHeight),
    border:'3px solid #fff3c9',borderRadius:8,boxShadow:'0 0 0 2px #613b40'}}/>;
}
