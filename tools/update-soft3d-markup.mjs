/* Replace decorative SVG artwork only; preserve the DOM and every attribute. */
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {iconArtwork,ICON_SET,ICON_SET_VERSION} from '../js/icon-set.js';
const inferred = [ [/চেভ|chevron|m9 5 7 7|M4 12h16|M20 12H4/, 'next'], [/শেয়ার|শেয়ার|শেয়ার|WhatsApp/, 'whatsapp'], [/ফি/, 'wallet'], [/প্রোফাইল/, 'user'], [/রিপোর্ট/, 'reports'], [/নোটিফিকেশন/, 'bell'], [/লগআউট/, 'logout'], [/ইনস্টল/, 'download'], [/বিশ্বস্ত/, 'shield'], [/গাঢ় থিম/, 'moon'], [/যোগাযোগ/, 'chat'], [/পরীক্ষা/, 'exam'], [/ছবি|ফটো/, 'edit'], [/শিক্ষার্থী/, 'students'] ];
for(const file of readdirSync('.').filter(x=>x.endsWith('.html'))){
 const source=readFileSync(file,'utf8'),dom=new JSDOM(source);const svgs=[...dom.window.document.querySelectorAll('svg')];
 let i=0,count=0;
 const result=source.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/g,original=>{
  const node=svgs[i++];if(!node || node.closest('symbol,defs') || node.id)return original;
  let name=node.dataset.icon;
  if(!name){
   const path=node.innerHTML;
   if(/m9 5 7 7|m9 5 7 7|M4 12h16/i.test(path))name='next';
   else if(/M20 12H4/i.test(path))name='back';
   else {const label=node.closest('button,label,article')?.textContent || node.parentElement?.className || '';name=inferred.find(([pattern])=>pattern.test(label))?.[1];}
  }
  if(!name){
    const paths=node.innerHTML;
    if(paths.includes('M9 18h6'))name='bolt';
    else if(paths.includes('M20 11a8'))name='whatsapp';
    else if(paths.includes('M3 7h4'))name='camera';
    else if(paths.includes('M5 17H3V3'))name='copy';
    else if(paths.includes('M12 4H3'))name='edit';
    else if(paths.includes('cx="4"'))name='more';
    else if(paths.includes('cx="8"'))name='receipt';
  }
  if(!name)return original;
  const variant=node.dataset.iconStyle || (node.closest('.nav-chip,.app-topbar-icon,.more-chevron,.pay-back')?'glyph':'color');
  const artwork=iconArtwork(name,variant);let start=original.slice(0,original.indexOf('>')+1);
  start=start.replace(/\sdata-icon(?:-set|-version|-style)?="[^"]*"/g,'');
  start=start.slice(0,-1)+` data-icon="${name}" data-icon-set="${ICON_SET}" data-icon-version="${ICON_SET_VERSION}" data-icon-style="${artwork.style}">`;
  count++;return start+artwork.markup+'</svg>';
 });
 if(count)writeFileSync(file,result);console.log(file,count);dom.window.close();
}
