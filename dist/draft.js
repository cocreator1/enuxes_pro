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
   ownerTab='My Store';await refreshDashboard();toast('Your store is published.');
  }catch(error){status.textContent=error.message;button.disabled=false;}
 };
}
function renderSharedOwnerPreview(target){
 const store=ownerStore;
 target.innerHTML='<div class="toolbar"><button data-owner-tab="Business profile">Edit profile</button><button data-owner-tab="Products">Add or edit products</button><button data-owner-tab="Store builder">Edit page layout</button>'
  +(store.active?'<a class="button" href="/'+esc(store.slug)+'">View live store ↗</a>':store.owner_published_at?'':'<button class="primary" data-owner-tab="Ready to Publish">Ready to Publish</button>')+'</div>'
  +'<iframe class="draft-store-preview" title="Storefront preview" src="/'+esc(store.slug)+'?owner-preview=1"></iframe>';
}

function canEditInlineStore(){
 return storefrontPreview&&Boolean(business?.demo_pack);
}

function inlineEditButton(kind,id,label){
 return canEditInlineStore()?'<button type="button" data-inline-edit="'+kind+'" data-inline-id="'+esc(id)+'">'+label+'</button>':'';
}

async function reloadInlineStore(){
 const snapshot=await readStorefront(business.slug);
 if(!snapshot)throw new Error('Store access is unavailable.');
 applyStorefront(snapshot);
 ownerStore=business;
 renderShop();
 toast('Saved.');
}

app.addEventListener('click',event=>{
 const button=event.target.closest('[data-inline-edit],[data-inline-cancel]');
 if(!button||!canEditInlineStore())return;
 const open=app.querySelector('.inline-store-editor');
 if(button.hasAttribute('data-inline-cancel')){
  if(!open.querySelector('form button:disabled,[data-save-layout]:disabled'))open.remove();
  return;
 }
 if(open){open.scrollIntoView({block:'nearest'});return;}
 const editor=document.createElement('section');
 editor.className='inline-store-editor panel stack';
 const {inlineEdit:kind,inlineId:id}=button.dataset;
 const anchor=button.closest('.shop-card,[data-home-section],.shop-heading');
 if(!anchor)return;
 ownerStore=business;
 anchor.after(editor);
 if(kind==='sections')layoutEditor(editor,publishedContent,reloadInlineStore);
 else editor.innerHTML=kind==='profile'?profileForm(business,publishedContent):productForm(id?getProduct(id):undefined);
 editor.insertAdjacentHTML('afterbegin','<div class="row"><strong>'+button.textContent+'</strong><button type="button" data-inline-cancel>Cancel</button></div>');
 editor.scrollIntoView({block:'nearest'});
});
