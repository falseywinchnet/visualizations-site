// Use exactly the Three.js revision shipped by the site in Node-side checks.
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../docs/spider-drive/vendor/three.module.js',import.meta.url).href:specifier,context);}});
