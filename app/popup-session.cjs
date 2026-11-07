'use strict';
const {contained}=require('./core.cjs');

// Pointer tracking is independent of Shift, including the journey into the popup.
class PopupSession {
  constructor({visible,bounds,close,delay=180,schedule=setTimeout,cancel=clearTimeout}){
    Object.assign(this,{visible,bounds,close,delay,schedule,cancel});
    this.active=false;this.pending=false;this.entered=false;this.anchor=null;this.point=null;
    this.origin=null;this.lastShownAnchor=null;this.lastShownOrigin=null;
    this.timer=null;this.gesture=0;this.suppressed=null;this.latestSequence=0;this.dismissedThrough=0;
  }
  cancelClose(){if(this.timer!==null){this.cancel(this.timer);this.timer=null;}}
  reset(){this.cancelClose();this.active=false;this.pending=false;this.entered=false;this.anchor=null;this.origin=null;this.lastShownAnchor=null;this.lastShownOrigin=null;this.dismissedThrough=this.latestSequence;}
  newReader(){this.reset();this.gesture=0;this.suppressed=null;this.latestSequence=0;this.dismissedThrough=0;}
  shiftDown(gesture){
    this.gesture=gesture;
    this.suppressed=this.active||this.visible()?gesture:null;
    if(this.suppressed!==null)this.close();
  }
  noteScan(sequence){if(Number.isInteger(sequence))this.latestSequence=Math.max(this.latestSequence,sequence);}
  accepts({gesture,sequence}={}){
    if(gesture!==undefined&&(gesture!==this.gesture||gesture===this.suppressed))return false;
    return sequence===undefined||(sequence>this.dismissedThrough&&sequence>=this.latestSequence);
  }
  begin(point,anchor,preservePointer=false){
    this.cancelClose();this.active=true;this.pending=true;this.entered=false;if(!preservePointer||!this.point)this.point=point;
    this.anchor=anchor||{x:point.x-2,y:point.y-2,width:5,height:5};
    this.origin=point;
    this.check();
  }
  shown(anchor){this.pending=false;this.anchor=anchor;this.lastShownAnchor=anchor;this.lastShownOrigin=this.origin;this.check();}
  empty(){
    this.pending=false;
    if(this.visible()&&this.atSource(this.lastShownAnchor,this.lastShownOrigin)){this.anchor=this.lastShownAnchor;this.origin=this.lastShownOrigin;}
    else{this.anchor=null;this.origin=null;}
    this.check();
  }
  atSource(anchor=this.anchor,origin=this.origin){
    if(!this.point)return false;
    const nearby=anchor&&contained(this.point,{x:anchor.x-6,y:anchor.y-6,width:anchor.width+12,height:anchor.height+12});
    return nearby||Boolean(origin&&Math.abs(this.point.x-origin.x)<=8&&Math.abs(this.point.y-origin.y)<=8);
  }
  pointer(point){this.point=point;this.check();}
  check(){
    if(!this.active||!this.point)return;
    if(this.visible()&&contained(this.point,this.bounds())){this.entered=true;this.cancelClose();return;}
    if(!this.entered&&this.atSource()){this.cancelClose();return;}
    if(this.timer===null)this.timer=this.schedule(()=>{this.timer=null;this.close();},this.delay);
  }
}
module.exports={PopupSession};
