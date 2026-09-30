import { resolve } from 'node:path';
const directory = resolve(import.meta.dir, '../preview');
const port = Number(process.env.PORT) || 4178;
const server = Bun.serve({hostname:'127.0.0.1',port,async fetch(request){
  const url = new URL(request.url);
  const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if(!['index.html','app.js'].includes(name))return new Response('Not found',{status:404});
  const file = Bun.file(resolve(directory,name));
  return await file.exists() ? new Response(file,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}}) : new Response('Build the preview first',{status:404});
}});
console.log(`LumiRoam is waiting at ${server.url}`);
