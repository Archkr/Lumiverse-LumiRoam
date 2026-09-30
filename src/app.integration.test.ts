import { test, expect } from 'bun:test';
import { JSDOM } from 'jsdom';
import { createApp } from './app';
import { generateWorld } from './world';
import type { SaveState } from './types';

test('the actual app can follow map clicks, collect every wisp, and awaken the lighthouse', async () => {
  const dom=new JSDOM('<!doctype html><body><main></main></body>',{url:'http://localhost/',pretendToBeVisual:true});
  const globals=globalThis as Record<string,unknown>, previous=new Map<string,unknown>();
  const replace=(name:string,value:unknown)=>{previous.set(name,globals[name]);globals[name]=value;};
  for(const name of ['window','document','Element','HTMLElement','HTMLCanvasElement','AbortController'])replace(name,(dom.window as unknown as Record<string,unknown>)[name]);
  replace('ResizeObserver',class{observe(){}disconnect(){}});
  let callback: FrameRequestCallback | null = null;
  replace('requestAnimationFrame',(next:FrameRequestCallback)=>{callback=next;return 1;});
  replace('cancelAnimationFrame',()=>{callback=null;});
  Object.defineProperty(dom.window.HTMLElement.prototype,'clientWidth',{get:()=>1280});
  Object.defineProperty(dom.window.HTMLElement.prototype,'clientHeight',{get:()=>800});
  dom.window.matchMedia=(()=>({matches:false})) as unknown as typeof dom.window.matchMedia;
  const gradient={addColorStop(){}};
  const context=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(target,key)=>key in target?Reflect.get(target,key):()=>{},set:(target,key,value)=>{Reflect.set(target,key,value);return true;}});
  dom.window.HTMLCanvasElement.prototype.getContext=(()=>context) as unknown as typeof dom.window.HTMLCanvasElement.prototype.getContext;
  let saved:SaveState|null=null;
  const app=createApp(dom.window.document.querySelector('main')!,{save:async state=>{saved=state;}});
  try{
    await new Promise(resolve=>setTimeout(resolve,0));
    const world=generateWorld();
    let now=performance.now();
    const tick=()=>{now+=1000/30;const next=callback;expect(next).not.toBeNull();next!(now);};
    const go=(target:{x:number;y:number})=>{
      const mapButton=dom.window.document.querySelector<HTMLButtonElement>('[data-action=map]')!;
      mapButton.click();
      const map=dom.window.document.querySelector<HTMLCanvasElement>('.lv-map-large')!;
      map.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:550,bottom:450,width:550,height:450,toJSON(){}});
      const scale=Math.min((550-24)/world.width,(450-24)/world.height);
      const x=(550-world.width*scale)/2+target.x/world.tileSize*scale;
      const y=(450-world.height*scale)/2+target.y/world.tileSize*scale;
      map.dispatchEvent(new dom.window.MouseEvent('click',{clientX:x,clientY:y,bubbles:true}));
      let reached=false;
      for(let frame=0;frame<5000;frame++){
        tick();const position=app.getState().player;
        if(Math.hypot(position.x-target.x,position.y-target.y)<3){reached=true;break;}
      }
      expect(reached).toBe(true);
    };
    // A map has decorative margins: clicking each painted wisp must still
    // produce the correct world destination and trigger the real collection UI.
    for(const wisp of world.wisps){go(wisp);expect(app.getState().collected).toContain(wisp.id);}
    expect(dom.window.document.querySelector('.lv-quest-count')?.textContent).toBe('6 / 6');
    expect(app.getState().journal.filter(entry=>world.wisps.some(wisp=>wisp.name===entry.title))).toHaveLength(6);
    const tower=world.props.find(prop=>prop.kind==='tower')!;
    go({x:tower.x,y:tower.y+40});
    const root=dom.window.document.querySelector('.lv-app')!;
    root.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:' ',bubbles:true}));
    expect(app.getState().lighthouseLit).toBe(true);
    expect(app.getState().timeOfDay).toBe('night');
    expect(dom.window.document.querySelector('.lv-quest h2')?.textContent).toBe('The stars came home');
    await app.flushSave();
    expect(saved).not.toBeNull();expect(saved!.lighthouseLit).toBe(true);expect(saved!.collected).toHaveLength(6);
  }finally{
    app.destroy();dom.window.close();
    for(const [name,value] of previous){if(value===undefined)delete globals[name];else globals[name]=value;}
  }
},30_000);
