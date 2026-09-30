import { createApp } from './app';
import { normalizeSave } from './persistence';
const key='lumiroam.lantern-isles.v1';
const app=createApp(document.getElementById('app')!,{
  // Preserve journeys started before the extension received its final name.
  async load(){const saved=localStorage.getItem(key)??localStorage.getItem('lumivale.lantern-isles.v1');return saved?normalizeSave(JSON.parse(saved)):null;},
  async save(state){localStorage.setItem(key,JSON.stringify(state));},
});
window.addEventListener('pagehide',()=>app.destroy(),{once:true});
