const homeSections={profile:'Store profile',slideshow:'Slideshow and banners',search:'Search',categories:'Categories',featured:'Featured products'};
const homeDefaults={primary:'#075C3A',accent:'#E3ECDB',background:'#F7F8F3',card:'#FFFFFF',text:'#13251B'};
let previewHomeSettings;
function homeSettings(raw){
 const defaults=Object.keys(homeSections);
 const order=Array.isArray(raw?.order)&&raw.order.length===defaults.length&&defaults.every(key=>raw.order.includes(key))?[...raw.order]:defaults;
 return {order,locks:order.filter(key=>Array.isArray(raw?.locks)&&raw.locks.includes(key)),
  colours:Object.fromEntries(Object.entries(homeDefaults).map(([key,value])=>[key,/^#[0-9a-f]{6}$/i.test(raw?.colours?.[key]||'')?raw.colours[key]:value]))};
}
function homeMove(settings,section,position){
 const from=settings.order.indexOf(section);
 if(from<0||!Number.isInteger(position)||position<0||position>=settings.order.length)throw new Error('Choose a valid section position.');
 if(from===position)return;
 const order=[...settings.order];order.splice(from,1);order.splice(position,0,section);
 const blocking=settings.locks.find(key=>order.indexOf(key)!==settings.order.indexOf(key));
 if(blocking)throw new Error('Unlock '+homeSections[blocking]+' before moving it from position '+(settings.order.indexOf(blocking)+1)+'.');
 settings.order=order;
}
function colourContrast(a,b){
 const light=hex=>hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255)
  .reduce((sum,v,i)=>sum+[.2126,.7152,.0722][i]*(v<=.04045?v/12.92:((v+.055)/1.055)**2.4),0);
 const pair=[light(a),light(b)].sort((x,y)=>y-x);
 return (pair[0]+.05)/(pair[1]+.05);
}
function homeContrast(colours){
 return [[colours.text,colours.background,'Page text'],[colours.text,colours.card,'Card text'],
  [colours.text,colours.accent,'Accent text'],['#FFFFFF',colours.primary,'Primary button text']]
  .filter(([fg,bg])=>colourContrast(fg,bg)<4.5).map(([, , label])=>label);
}
function currentHomeSettings(){
 return previewHomeSettings || publishedContent?.home_settings;
}
function applyHomeColours(raw){
 if(!raw?.colours)return;
 const {colours}=homeSettings(raw),style=document.body.style;
 document.body.classList.add('custom-store-colours');
 for(const [name,value] of Object.entries(colours))style.setProperty('--store-'+name,value);
}
function arrangeShopHome(target,settings){
 const children=[...target.children];
 for(const key of homeSettings(settings).order){
  const section=children.find(node=>node.dataset.homeSection===key);
  if(section)target.append(section);
 }
}
if(new URLSearchParams(location.search).get('owner-preview')==='1'){
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='enuxes-home-preview')return;
  previewHomeSettings=homeSettings(event.data.settings);
  if(business&&document.body.classList.contains('customer-shop')&&!modal.open)renderShop();
 });
}
async function ownerHomeLayout(target,token){
 const store=ownerStore,content=await contentFor(store.id,token);
 if(!target.isConnected)return;
 const settings=homeSettings(content.home_settings);
 target.innerHTML='<div class="home-editor-grid"><form id="owner-home-layout" class="panel stack"><h2>Home Layout</h2><p>Drag a handle or choose a position. Locked sections stay in their slots.</p>'
  +'<div id="home-sections" class="stack"></div><h2>Store Colours</h2><div class="home-colour-fields">'
  +Object.entries(settings.colours).map(([key,value])=>'<fieldset class="home-colour"><legend>'+key+'</legend><input type="color" aria-label="'+key+' colour picker" data-colour="'+key+'" value="'+value+'"><input data-hex="'+key+'" aria-label="'+key+' hex colour" required pattern="#[0-9a-fA-F]{6}" maxlength="7" value="'+value+'"></fieldset>').join('')
  +'</div><button type="button" id="home-reset">Reset to Default</button><p role="status" id="home-contrast"></p><p role="status" id="home-layout-status"></p><button class="primary">Save layout and colours</button></form>'
  +'<iframe title="Live storefront layout preview" class="draft-store-preview" src="/'+esc(store.slug)+'?owner-preview=1"></iframe></div>';
 const form=target.querySelector('form'),rows=form.querySelector('#home-sections'),frame=target.querySelector('iframe'),status=form.querySelector('#home-layout-status');
 const sendPreview=()=>frame.contentWindow?.postMessage({type:'enuxes-home-preview',settings},location.origin);
 const contrast=()=>{
  const warnings=homeContrast(settings.colours);
  form.querySelector('#home-contrast').textContent=warnings.length?'Low contrast: '+warnings.join(', ')+'.':'Text contrast checks passed.';
 };
 const render=()=>{
  rows.innerHTML=settings.order.map((key,i)=>{
   const locked=settings.locks.includes(key),name=homeSections[key];
   return '<div class="home-section-row" data-home-row="'+key+'"><span class="home-slot">'+(i+1)+'</span>'
    +'<button type="button" class="home-drag" data-home-drag="'+key+'" aria-label="Drag '+name+'" '+(locked?'disabled':'')+'>⠿</button><strong>'+name+'</strong>'
    +'<label>Position<select data-position="'+key+'" '+(locked?'disabled':'')+'>'+settings.order.map((_,j)=>'<option value="'+j+'" '+(i===j?'selected':'')+'>'+(j+1)+'</option>').join('')+'</select></label>'
    +'<button type="button" data-home-lock="'+key+'" aria-pressed="'+locked+'">'+(locked?'Unlock':'Lock')+'</button></div>';
  }).join('');
 };
 const move=(key,position)=>{
  try{homeMove(settings,key,position);status.textContent='Unsaved changes.';sendPreview();}
  catch(error){status.textContent=error.message;}
  render();
 };
 frame.addEventListener('load',sendPreview);
 rows.addEventListener('change',event=>{if(event.target.dataset.position)move(event.target.dataset.position,Number(event.target.value));});
 rows.addEventListener('click',event=>{
  const key=event.target.closest('[data-home-lock]')?.dataset.homeLock;if(!key)return;
  settings.locks=settings.locks.includes(key)?settings.locks.filter(x=>x!==key):[...settings.locks,key];
  status.textContent='Unsaved changes.';render();
 });
 rows.addEventListener('pointerdown',event=>{
  const handle=event.target.closest('[data-home-drag]');
  if(!handle||handle.disabled||event.button!==0)return;
  handle.setPointerCapture(event.pointerId);
  const startY=event.clientY;
  const over=e=>document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-home-row]');
  handle.onpointermove=e=>{
   rows.querySelector('[data-drop-target]')?.removeAttribute('data-drop-target');
   over(e)?.setAttribute('data-drop-target','');
  };
  handle.onpointerup=e=>{
   const hit=over(e),slot=settings.order.indexOf(hit?.dataset.homeRow);
   clear();
   if(slot>=0&&Math.abs(e.clientY-startY)>4)move(handle.dataset.homeDrag,slot);
  };
  const clear=()=>{rows.querySelector('[data-drop-target]')?.removeAttribute('data-drop-target');handle.onpointermove=null;handle.onpointerup=null;};
  handle.onpointercancel=clear;
 });
 form.addEventListener('input',event=>{
  const field=event.target,key=field.dataset.colour||field.dataset.hex;
  if(!key||!/^#[0-9a-f]{6}$/i.test(field.value))return;
  settings.colours[key]=field.value;
  form.querySelector((field.dataset.colour?'[data-hex=':'[data-colour=')+key+']').value=field.value;
  status.textContent='Unsaved changes.';contrast();sendPreview();
 });
 form.querySelector('#home-reset').onclick=()=>{
  settings.colours={...homeDefaults};
  for(const [key,value] of Object.entries(homeDefaults)){
   form.querySelector('[data-hex='+key+']').value=value;
   form.querySelector('[data-colour='+key+']').value=value;
  }
  status.textContent='Default colours restored. Save to apply them to the store.';contrast();sendPreview();
 };
 form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('button.primary'),snapshot=structuredClone(settings);
  button.disabled=true;status.textContent='Saving…';
  try{await request('/rest/v1/rpc/save_owner_home',{method:'POST',token:await getSessionToken(),data:{p_store:store.id,p_settings:snapshot}});signalStorefrontSave(store.slug);status.textContent=JSON.stringify(snapshot)===JSON.stringify(settings)?'Saved.':'Saved earlier changes. New edits are unsaved.';sendPreview();}
  catch(error){status.textContent=error.message;}finally{button.disabled=false;}
 };
 render();contrast();
}
