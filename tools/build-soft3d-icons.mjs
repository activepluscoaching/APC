/* AI-designed companion vector icons. Source silhouettes retain their meaning;
   one shared material/light rig keeps all controls consistent with the generated art. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { ILLUSTRATIONS, GLYPHS, SEMANTIC_ART } from '../js/icon-set.js';
mkdirSync('assets/icons/ai-3d', { recursive: true });
const palette={blue:['#72adff','#285bc7'],mint:['#82edd1','#159e83'],gold:['#ffe498','#d89b35'],violet:['#c6b8ff','#8262c9'],coral:['#ffb4ac','#df686b'],paper:['#ffffff','#dce7f5'],'blue-back':['#dcecff','#97b9eb'],'mint-back':['#dcfff2','#8fd9c1'],'on-color':['#ffffff','#eff8ff'],outline:['#365477','#243d60']};
for(const name of new Set([...Object.keys(ILLUSTRATIONS),...Object.keys(GLYPHS),...Object.keys(SEMANTIC_ART),'chevron-down'])) {
 let markup=SEMANTIC_ART[name]||ILLUSTRATIONS[name]||GLYPHS[name]||'<path d="m6 9 6 6 6-6"/>';
 const illustrated=Boolean(ILLUSTRATIONS[name]||SEMANTIC_ART[name]);
 markup=markup.replace(/var\(--icon-([\w-]+)(?:, currentColor)?\)/g,(_,tone)=>`url(#${tone})`);
 const defs=Object.entries(palette).map(([tone,[a,b]])=>`<linearGradient id="${tone}" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`).join('');
 const light='<filter id="depth" x="-30%" y="-30%" width="170%" height="170%"><feDropShadow dx="0" dy=".65" stdDeviation=".45" flood-color="#1d3557" flood-opacity=".22"/></filter>';
 writeFileSync(`assets/icons/ai-3d/${name}.svg`,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="url(#blue)" stroke-width="${illustrated?1.25:2.2}" stroke-linecap="round" stroke-linejoin="round"><defs>${defs}${light}</defs><g transform="translate(.6 .2) scale(.94)" filter="url(#depth)">${markup}</g></svg>`);
}
