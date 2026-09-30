import { resolve } from 'node:path';
const root = resolve(import.meta.dir, '..');
for (const [entry, target, output] of [
  ['src/backend.ts', 'bun', 'dist/backend.js'],
  ['src/frontend.ts', 'browser', 'dist/frontend.js'],
  ['src/preview.ts', 'browser', 'preview/app.js'],
] as const) {
  const build = await Bun.build({ entrypoints: [resolve(root,entry)], target, format: 'esm', minify: true, naming: resolve(root,output) });
  if (!build.success) { for (const log of build.logs) console.error(log); process.exit(1); }
  for (const artifact of build.outputs) await Bun.write(resolve(root,output),artifact);
  console.log(`Built ${output}`);
}
const template=await Bun.file(resolve(root,'preview/index.html')).text();
const code=(await Bun.file(resolve(root,'preview/app.js')).text()).replace(/<\/script/gi,'<\\/script');
await Bun.write(resolve(root,'LumiRoam.html'),template.replace('<script type="module" src="./app.js"></script>',()=>`<script type="module">${code}</script>`));
console.log('Built LumiRoam.html (standalone, offline)');
