const draftPacks={clothing:'Clothing',general:'General online store',restaurant:'Restaurant',bar:'Bar and lounge',barbershop:'Barbershop',fallback:'Shared fallback'};
const draftTypes=[
 ['Clothing','RETAIL','clothing'],['General online store','ONLINE_STORE','general'],['General retail','RETAIL','general'],
 ['Restaurant','RESTAURANT','restaurant'],['Café','CAFE','restaurant'],['Bar or lounge','BAR','bar'],
 ['Barbershop','OTHER','barbershop'],['Hotel','HOTEL','fallback'],['Other','OTHER','fallback']
];
const draftAsset=(pack,file)=>'/demo-packs/'+pack+'/'+file+'.webp';
function bindDraftPack(form){
 const type=form.elements.type,pack=form.elements.pack, preview=form.querySelector('#draft-pack-preview');
 const show=()=>{
  const selected=pack.value;
  preview.innerHTML='<div class="draft-pack-head">'+imageTag(location.origin+draftAsset(selected,'profile'),'Profile artwork')
   +'<strong>Store Name</strong></div><img class="draft-pack-banner" src="'+draftAsset(selected,'banner')+'" alt="Starter banner artwork">'
   +'<div class="shop-grid">'+[1,2,3,4].map(i=>'<article class="shop-card"><img src="'+draftAsset(selected,'item-'+i)+'" alt="Starter artwork '+i+'"><div class="shop-card-copy"><strong>Product Name</strong><div>N$0-00</div></div></article>').join('')+'</div>';
 };
 const choices=()=>{
  const [,category,preferred]=draftTypes[Number(type.value)];
  const options=category==='RETAIL'||category==='ONLINE_STORE'?[preferred,preferred==='clothing'?'general':'clothing']:
    category==='OTHER'?[preferred,preferred==='barbershop'?'fallback':'barbershop']:[preferred];
  pack.innerHTML=options.map(value=>'<option value="'+value+'">'+draftPacks[value]+'</option>').join('');
  show();
 };
 type.addEventListener('change',choices);pack.addEventListener('change',show);choices();
}
let draftProductToEdit;
async function renderDraftChecklist(target,token){
 const store=ownerStore;
 const endpoint='/rest/v1/rpc/owner_draft';
 const load=publish=>request(endpoint,{method:'POST',token,data:{p_store:store.id,p_publish:publish}});
 const issues=await load(false);
 if(!target.isConnected)return;
 target.innerHTML='<section class="panel stack"><h2>Ready to Publish</h2><p>This store is private until you publish it.</p><ul>'
  +issues.map(issue=>'<li>'+esc(issue.message)+' <button data-draft-tab="'+esc(issue.tab)+'" data-draft-product="'+esc(issue.id||'')+'">Fix</button></li>').join('')
  +'</ul>'+(issues.length?'':'<p>All required fields are complete.</p>')
  +'<div><button class="primary" id="draft-publish" '+(issues.length?'disabled':'')+'>Publish store</button></div><p role="status"></p></section>';
 target.onclick=async event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.draftTab){draftProductToEdit=button.dataset.draftProduct;ownerTab=button.dataset.draftTab;ownerDashboard();return;}
  if(button.id!=='draft-publish')return;
  button.disabled=true;const status=target.querySelector('[role=status]');status.textContent='Publishing…';
  try{
   const pending=await load(true);
   if(pending.length){await renderDraftChecklist(target,await getSessionToken());return;}
   ownerTab='Profile';await refreshDashboard();toast('Your store is published.');
  }catch(error){status.textContent=error.message;button.disabled=false;}
 };
}
const embeddedOwnerPreview=new URLSearchParams(location.search).get('embedded')==='1'&&window.parent!==window;
function canEditInlineStore(){
 return storefrontPreview&&!embeddedOwnerPreview;
}

function ownerStoreToolbar(){
 if(!storefrontPreview||!embeddedOwnerPreview)return '';
 const editorUrl='/'+encodeURIComponent(business.slug)+'?owner-preview=1';
 return '<div class="owner-store-toolbar"><a class="button primary" target="_top" href="'+editorUrl+'">Edit Store</a></div>';
}

function inlineEditButton(kind,id,label){
 return canEditInlineStore()?'<button type="button" data-inline-edit="'+kind+'" data-inline-id="'+esc(id)+'" aria-label="'+esc(label)+'">'+(['profile','sections','product'].includes(kind)&&!label.startsWith('Add ')?'⋯':label)+'</button>':'';
}

function signalStorefrontSave(slug){
 try{localStorage.setItem('enuxes-storefront-saved:'+slug,crypto.randomUUID());}catch{}
}

async function reloadInlineStore(){
 signalStorefrontSave(business.slug);
 const snapshot=await readStorefront(business.slug);
 if(!snapshot)throw new Error('Store access is unavailable.');
 const top=window.scrollY;
 applyStorefront(snapshot);
 ownerStore=business;
 renderShop();
 window.scrollTo(0,top);
 toast('Saved.');
}

app.addEventListener('click',event=>{
 const button=event.target.closest('[data-inline-edit]');
 if(!button||!canEditInlineStore())return;
 const {inlineEdit:kind,inlineId:id}=button.dataset;
 ownerStore=business;
 if(id){detail(id);if(kind==='photo')modal.querySelector('.owner-photo-editor input')?.click();return;}
 modal.className='owner-edit-sheet';
 openDialog(button.getAttribute('aria-label')||button.textContent,'<div class="inline-store-editor"></div>');
 const editor=modal.querySelector('.inline-store-editor');
 if(kind==='sections')layoutEditor(editor,publishedContent,async()=>{await reloadInlineStore();modal.close();});
 else{
  editor.innerHTML=kind==='profile'?profileForm(business,publishedContent):productForm({},true);
  initOwnerPhotos();
 }
});

modal.addEventListener('click',event=>{
 const button=event.target.closest('[data-inline-delete]');
 if(!button||!canEditInlineStore())return;
 openDialog('Delete item','<div class="inline-store-editor"><form id="owner-delete-product" data-id="'+esc(button.dataset.inlineDelete)+'"><p>Remove this item from your store?</p><button class="primary">Delete item</button><button type="button" data-action="close">Cancel</button><p role="status"></p></form></div>');
});

const photoDrafts=new WeakMap();
function initOwnerPhotos(){
 const editor=modal.querySelector('.owner-photo-editor');
 if(!editor)return;
 const state={urls:JSON.parse(editor.dataset.photos)};
 photoDrafts.set(editor,state);
 const save=editor.closest('form').querySelector('button.primary');
 const picker=(label,index)=>'<label class="owner-photo-picker">'+label+'<input type="file" aria-label="'+label+'" accept="image/jpeg,image/png,image/webp,image/gif" data-photo-slot="'+index+'" '+(index<0?'multiple':'')+'></label>';
 const render=()=>{
  const [cover]=state.urls;
  editor.innerHTML='<div class="owner-photo-cover">'+(cover?imageTag(cover,'Cover photo')+'<span>Cover</span>'+picker('Replace Cover',0):'<p>No photos yet</p>')+'</div>'
   +'<small>'+state.urls.length+' / 10 photos</small><div class="owner-photo-grid">'+state.urls.map((url,i)=>'<div>'+imageTag(url,'Photo '+(i+1))+(i?'<button type="button" data-photo-cover="'+i+'">Set cover</button><button type="button" data-photo-left="'+i+'" aria-label="Move photo '+(i+1)+' earlier">←</button>':'<small>Cover</small>')+(i?picker('Replace',i):'')+'<button type="button" data-photo-remove="'+i+'">Remove</button></div>').join('')
   +(state.urls.length<10?picker('+ Add Photos',-1):'')+'</div><p role="status"></p>';
 };
 const upload=async(files,index)=>{
  const status=editor.querySelector('[role=status]');
  if(index<0&&files.length+state.urls.length>10){status.textContent='Choose up to '+(10-state.urls.length)+' more photos.';return;}
  const controls=[...editor.querySelectorAll('button,input'),save];
  controls.forEach(control=>control.disabled=true);
  status.textContent='Uploading '+files.length+' photo'+(files.length===1?'…':'s…');
  try{
   const urls=await uploadMedia(files);
   if(index<0)state.urls.push(...urls);
   else if(urls.length)state.urls[index]=urls[0];
   render();
   editor.querySelector('[role=status]').textContent='Photos ready. Save Changes to apply them.';
  }catch(error){
   status.textContent=error.message+' ';
   const retry=document.createElement('button');
   retry.type='button';retry.textContent='Retry upload';
   retry.onclick=()=>upload(files,index);
   status.append(retry);
  }finally{controls.forEach(control=>control.disabled=false);}
 };
 editor.onchange=event=>{
  const files=Array.from(event.target.files||[]);
  if(files.length)upload(files,Number(event.target.dataset.photoSlot));
 };
 editor.onclick=event=>{
  const button=event.target.closest('button');
  if(!button)return;
  const {photoCover,photoLeft,photoRemove}=button.dataset;
  if(photoRemove!==undefined)state.urls.splice(Number(photoRemove),1);
  else if(photoCover!==undefined)state.urls.unshift(...state.urls.splice(Number(photoCover),1));
  else if(photoLeft!==undefined){const i=Number(photoLeft);[state.urls[i-1],state.urls[i]]=[state.urls[i],state.urls[i-1]];}
  else return;
  render();
 };
 render();
}

const visualDestinations={home:'Home',shop:'Shop',catalogue:'Catalogue',cart:'Cart',link:'External HTTPS link'};
function visualSetting(key){
 return publishedContent?.merchandising?.visual?.[key]||{};
}
function visualDots(key,label){
 return canEditInlineStore()?'<button class="visual-dots" type="button" data-visual-key="'+esc(key)+'" aria-label="Edit '+esc(label)+'">⋯</button>':'';
}
function visualPaint(setting){
 if(!/^#[0-9a-f]{6}$/i.test(setting.colour||''))return '';
 const alpha=Math.min(1,Math.max(0,Number(setting.opacity??100)/100))||0;
 const rgb=setting.colour.slice(1).match(/../g).map(v=>Math.round(parseInt(v,16)*alpha+255*(1-alpha)));
 const luminance=rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
  .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 return 'background:rgb('+rgb.join(',')+');color:'+(luminance>.179?'#000':'#fff');
}
function visualButton(key,label,destination,icon=''){
 const setting=visualSetting(key);
 const target=Object.hasOwn(visualDestinations,setting.destination)?setting.destination:destination;
 const title=setting.label||label;
 const style=' style="'+visualPaint(setting)+'"';
 const control=target==='link'&&safeImage(setting.url)
  ?'<a class="visual-action" href="'+esc(setting.url)+'"'+style+'>'+icon+'<span>'+esc(title)+'</span></a>'
  :'<button data-shop-page="'+(target==='link'?destination:target)+'" '+(shopPage===target?'aria-current="page"':'')+style+'>'+icon+'<span>'+esc(title)+'</span></button>';
 return '<span class="visual-slot">'+control+visualDots(key,label)+'</span>';
}
function visualHeading(key,label){
 return '<span class="visual-slot"><h2>'+esc(visualSetting(key).label||label)+'</h2>'+visualDots(key,label)+'</span>';
}

app.addEventListener('click',event=>{
 const button=event.target.closest('[data-visual-key]');
 if(!button||!canEditInlineStore())return;
 const key=button.dataset.visualKey;
 const badge=key==='price-default'||key.startsWith('price:');
 const product=key.startsWith('price:')?getProduct(key.slice(6)):null;
 const heading=key.startsWith('heading:');
 const config=visualSetting(key);
 const defaults=badge?visualSetting('price-default'):{};
 const colour=[config.colour,defaults.colour].find(v=>/^#[0-9a-f]{6}$/i.test(v||''))||'#ffffff';
 const label=button.getAttribute('aria-label').slice(5);
 const destination=config.destination||key.split(':')[1];
 modal.className='owner-edit-sheet';
 openDialog(badge?'Price Badge Colour':label,'<form id="visual-settings">'
  +(product?'<div class="toolbar"><button type="button" data-visual-price>Edit Price</button><button type="button" data-visual-default>Store-wide colour</button></div>':'')
  +(!badge?'<label>'+ (heading?'Heading':'Button name')+'<input name="label" maxlength="80" value="'+esc(config.label||label)+'" required></label>':'')
  +(heading?'':'<label>Colour picker<input name="picker" type="color" value="'+colour+'"></label><label>Hex colour<input name="colour" pattern="#[0-9a-fA-F]{6}" value="'+colour+'" required></label><label>Opacity <output>'+esc(config.opacity??defaults.opacity??100)+'%</output><input name="opacity" type="range" min="0" max="100" value="'+esc(config.opacity??defaults.opacity??100)+'"></label>')
  +(!badge&&!heading?'<label>Navigate to<select name="destination">'+Object.entries(visualDestinations).map(([value,name])=>'<option value="'+value+'" '+(value===destination?'selected':'')+'>'+name+'</option>').join('')+'</select></label><label>External link<input name="url" type="url" maxlength="500" placeholder="https://" value="'+esc(config.url||'')+'"></label>':'')
  +'<div class="owner-editor-actions"><p class="visual-save-status" role="status" aria-live="polite"></p><button type="submit" class="primary">Save Changes</button>'+(badge?'<button type="button" data-visual-reset>'+(product?'Reset to Store Default':'Reset Colour')+'</button>':'')+'</div></form>');
 const form=modal.querySelector('#visual-settings');
 const fields=form.elements;
 if(fields.picker){
  fields.picker.oninput=()=>{fields.colour.value=fields.picker.value;};
  fields.colour.oninput=()=>{if(/^#[0-9a-f]{6}$/i.test(fields.colour.value))fields.picker.value=fields.colour.value;};
  fields.opacity.oninput=()=>{form.querySelector('output').value=fields.opacity.value+'%';};
 }
 let saving=false;
 const save=async reset=>{
  if(saving)return;
  const status=form.querySelector('[role=status]');
  const data=new FormData(form);
  const read=name=>String(data.get(name)??'').trim();
  const label=read('label');
  const colour=read('colour');
  const destination=read('destination');
  const url=read('url');
  if(!reset){
   if(!badge&&!label){status.textContent='Enter a name before saving.';return;}
   if(!heading&&!/^#[0-9a-f]{6}$/i.test(colour)){status.textContent='Enter a six-digit hex colour, such as #ffffff.';return;}
   if(destination==='link'&&!safeImage(url)){status.textContent='Enter an HTTPS link.';return;}
  }
  const value=heading?{label}:{colour,opacity:Number(read('opacity'))};
  if(!badge&&!heading)Object.assign(value,{label,destination,url:destination==='link'?url:''});
  saving=true;
  status.textContent='Saving…';
  const controls=[...form.querySelectorAll('button')];
  controls.forEach(control=>control.disabled=true);
  try{
   const token=await getSessionToken();
   const {merchandising={}}=await contentFor(business.id,token);
   const visual={...merchandising.visual};
   if(reset)delete visual[key];else visual[key]=value;
   const saved=await updateContent(business.id,{merchandising:{...merchandising,visual}},token);
   publishedContent=saved;
   signalStorefrontSave(business.slug);
   const top=window.scrollY;
   renderShop();
   window.scrollTo(0,top);
   if(form.isConnected)modal.close();
   toast('Changes saved.');
  }catch(error){status.textContent=error.message||'Could not save. Try again.';}
  finally{
   saving=false;
   controls.forEach(control=>control.disabled=false);
  }
 };
 form.noValidate=true;
 form.addEventListener('submit',event=>{event.preventDefault();save(false);});
 form.querySelector('[data-visual-reset]')?.addEventListener('click',()=>save(true));
 form.querySelector('[data-visual-price]')?.addEventListener('click',()=>{
  detail(product.id);
  modal.querySelector('[name=price]')?.focus();
 });
 form.querySelector('[data-visual-default]')?.addEventListener('click',()=>app.querySelector('[data-visual-key="price-default"]')?.click());
});
