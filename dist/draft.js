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
 return canEditInlineStore()?'<button type="button" data-inline-edit="'+kind+'" data-inline-id="'+esc(id)+'">'+label+'</button>':'';
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
 openDialog(button.textContent,'<div class="inline-store-editor"></div>');
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
