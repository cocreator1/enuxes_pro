let publishedContent;
const starterBlocks = () => [{kind:'catalogue'}];
const blockNames = {catalogue:'Product catalogue',text:'Text paragraph',image:'Image',slideshow:'Slideshow'};
const allowedImages = ['image/jpeg','image/png','image/webp','image/gif'];
const safeImage = value => typeof value==='string' && /^https:\/\//i.test(value) ? value : '';
const imageTag = (url,alt='') => safeImage(url) ? '<img loading="lazy" src="'+esc(url)+'" alt="'+esc(alt)+'">' : '';
const uploadField = (name,multiple=false) => '<label class="media-drop">Drop images here or browse<input name="'+name+'" type="file" accept="image/jpeg,image/png,image/webp,image/gif" '+(multiple?'multiple':'')+'></label>';
const field = (label,name,value,max,type='text',required=false) => '<label>'+label+'<input name="'+name+'" type="'+type+'" maxlength="'+max+'" value="'+esc(value)+'" '+(required?'required':'')+'></label>';

async function uploadMedia(files) {
  const list = Array.from(files).filter(file=>file.size);
  if (list.length>10 || list.some(file=>file.size>5242880 || !allowedImages.includes(file.type))) throw new Error('Choose up to 10 JPG, PNG, WebP or GIF images, each under 5 MB.');
  const token=await getSessionToken();
  return Promise.all(list.map(async file=>{
    const ext={ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif' }[file.type];
    const path=ownerStore.id+'/'+crypto.randomUUID()+'.'+ext;
    const response=await fetch(apiRoot+'/storage/v1/object/store-media/'+path,{method:'POST',headers:{apikey:publicKey,Authorization:'Bearer '+token,'Content-Type':file.type},body:file});
    if (!response.ok) throw new Error('An image could not be uploaded.');
    return apiRoot+'/storage/v1/object/public/store-media/'+path;
  }));
}

async function contentFor(id,token) {
  const rows=await request('/rest/v1/store_content?select=*&business_id=eq.'+id,{token});
  if (!rows.length) throw new Error('Store content is unavailable.');
  return rows[0];
}
async function updateContent(id,changes,token) {
  const rows=await request('/rest/v1/store_content?business_id=eq.'+id,{method:'PATCH',token,data:changes,prefer:'return=representation'});
  if(rows?.length!==1) throw new Error('No changes were saved. Check your store access and try again.');
  return rows[0];
}

async function ownerEditor(tab,target,token) {
  if(tab==='Account'){
    const username=adminSession.user?.app_metadata?.enuxes_owner_username;
    target.innerHTML='<div class="panel"><h2>Account</h2><p>Username · '+esc(username || adminSession.user?.email)+'</p><form id="main-admin-password">'
      +'<label>Current password<input name="current" type="password" autocomplete="current-password" required></label>'
      +'<label>New password<input name="password" type="password" minlength="14" maxlength="72" autocomplete="new-password" required></label>'
      +'<label>Confirm password<input name="confirm" type="password" minlength="14" maxlength="72" autocomplete="new-password" required></label>'
      +'<div><button class="primary">Update password</button></div><p id="password-result" role="status"></p></form></div>';
    return;
  }
  if(tab==='Products'){
    const rows=await request('/rest/v1/products?select=id,name,category,description,price_minor,sale_price_minor,image_url,gallery,sizes,colours,stock,active&business_id=eq.'+ownerStore.id+'&order=name',{token});
    if(!target.isConnected)return;
    target.innerHTML='<section class="panel stack"><div class="row"><h2>Products</h2><button id="owner-add-product">Add product</button></div>'
      +(rows.map((row,i)=>'<div class="row line"><span>'+esc(row.name)+' · '+(ownerStore.demo_pack&&row.price_minor===0?'N$0-00':money(row.price_minor/100))+'</span><div class="toolbar"><button data-product-edit="'+i+'">Edit</button>'
      +(ownerStore.demo_pack?'<button data-product-delete="'+i+'">Delete</button>':'')+'</div></div>').join('')||'<p>No products yet.</p>')+'</section>';
    target.addEventListener('click',event=>{
      const button=event.target.closest('button');
      if(!button) return;
      if(button.id==='owner-add-product') productEditor();
      if(button.dataset.productEdit!==undefined) productEditor(rows[Number(button.dataset.productEdit)]);
      if(button.dataset.productDelete!==undefined){
        const row=rows[Number(button.dataset.productDelete)];
        openDialog('Delete '+row.name,'<form id="owner-delete-product" data-id="'+row.id+'"><p>Remove this item from your store?</p><button class="primary">Delete product</button><p role="status"></p></form>');
      }
    });
    if(draftProductToEdit){
      const selected=rows.find(row=>row.id===draftProductToEdit);
      draftProductToEdit=null;
      if(selected)productEditor(selected);
    }
    return;
  }
  const content=await contentFor(ownerStore.id,token);
  if(tab==='Business profile'){
    target.innerHTML='<div class="panel"><h2>Business profile</h2>'+profileForm(ownerStore,content)+'</div>';
    return;
  }
  layoutEditor(target,content);
}

function profileForm(store,content){
  return '<form id="owner-profile">'
      +field('Business name','name',store.name,100,'text',true)+field('Category','category',content.category,80)
      +'<label>Description<textarea name="description" maxlength="1000">'+esc(store.description)+'</textarea></label>'
      +field('Public email','email',content.email,254,'email')+field('Public phone','phone',content.phone,80,'tel')
      +imageTag(content.logo,'Current business logo')+uploadField('logo')+'<div class="owner-editor-actions"><button class="primary">Save Changes</button><button type="button" data-action="close" class="owner-sheet-cancel">Cancel</button></div><p role="status"></p></form>';
}

function productEditor(product={}){
  openDialog(product.id?'Edit product':'Add product',productForm(product));
}

function productForm(product={},inPlace=false){
  const media=uploadField('photo',true)+'<small>Select up to 10 photos to replace the gallery. The first is the cover.</small>';
  const photos=[product.image_url,...(product.gallery||[])].filter(safeImage);
  const imagePicker='<div class="owner-photo-editor" data-photos="'+esc(JSON.stringify(photos.slice(0,10)))+'"></div>';
  return '<form id="owner-product" data-id="'+(product.id||'')+'">'+(inPlace?imagePicker:'')
    +field('Product name','name',product.name,100,'text',true)+field('Category','category',product.category,80,'text',true)
    +'<label>Description<textarea name="description" maxlength="1000">'+esc(product.description)+'</textarea></label>'
    +'<label>Price (N$)<input name="price" type="number" min="'+(product.price_minor===0?'0':'.01')+'" max="21474836.47" step=".01" required value="'+(product.price_minor==null?'':product.price_minor/100)+'"></label>'
    +'<label>Sale price (N$)<input name="sale" type="number" min=".01" max="21474836.47" step=".01" value="'+(product.sale_price_minor?product.sale_price_minor/100:'')+'"></label>'
    +field('Sizes (comma separated)','sizes',product.sizes?.join(', '),240)
    +field('Colours (comma separated)','colours',product.colours?.join(', '),240)
    +'<label>Stock (blank if untracked)<input name="stock" type="number" min="0" max="2147483647" step="1" value="'+esc(product.stock)+'"></label>'
    +(inPlace?'':imageTag(product.image_url,'Current product photo')+media)
    +'<label><span><input type="checkbox" name="active" '+(product.active===false?'':'checked')+'> Show in catalogue</span></label>'
    +'<div class="owner-editor-actions"><button class="primary">Save Changes</button>'+(inPlace?'<button type="button" data-action="close">Cancel</button>':'')+'</div><p role="status"></p></form>';
}

function layoutEditor(target,content,onSaved){
  const blocks=structuredClone(content.blocks || starterBlocks());
  const store=ownerStore;
  target.innerHTML='<section class="panel stack builder-shell"><div class="builder-publish"><div class="row"><div><h2>Page sections</h2><small>Arrange what appears on your storefront Home tab.</small></div>'
    +'<div class="toolbar"><button data-preview-layout>Preview draft</button><button class="primary" data-save-layout>'+(onSaved?'Save sections':'Publish layout')+'</button></div></div>'
    +'<p id="builder-status" role="status">Viewing the published layout.</p><a id="builder-live" href="/'+store.slug+'" target="_blank" rel="noopener" hidden>Open storefront Home ↗</a></div>'
    +'<div class="toolbar builder-tools">'
    +['text','image','slideshow'].map(kind=>'<button data-add-block="'+kind+'">+ '+blockNames[kind]+'</button>').join('')
    +'</div><small>Drag sections or use the arrows · Slideshow limit '+content.slideshow_limit+'</small><div id="builder-blocks" class="stack"></div></section>';
  const list=target.querySelector('#builder-blocks'), status=target.querySelector('#builder-status');
  const publish=target.querySelector('[data-save-layout]'), live=target.querySelector('#builder-live');
  let uploads=0,saving=false,revision=0;
  const sync=()=>{publish.disabled=saving||uploads>0;};
  const note=(message,error=false)=>{status.textContent=message;status.dataset.error=String(error);};
  const dirty=()=>{revision++;live.hidden=true;note('Unpublished changes.');};
  const render=()=>{ list.innerHTML=blocks.map((block,i)=>'<article class="panel stack" data-block="'+i+'" draggable="true"><div class="row"><strong>'+esc(blockNames[block.kind])+'</strong>'
    +'<div class="toolbar"><button data-move="-1" aria-label="Move section up" '+(!i?'disabled':'')+'>↑</button><button data-move="1" aria-label="Move section down" '+(i===blocks.length-1?'disabled':'')+'>↓</button>'
    +(block.kind==='catalogue'?'':'<button data-remove-block>Remove</button>')+'</div></div>'
    +(block.kind==='text'?'<textarea aria-label="Paragraph" data-block-text maxlength="1800">'+esc(block.text)+'</textarea>':'')
    +(block.kind==='slideshow'?'<label>Slide interval<select data-slide-interval><option value="3" '+(block.interval!==5?'selected':'')+'>3 seconds</option><option value="5" '+(block.interval===5?'selected':'')+'>5 seconds</option></select></label>':'')
    +(['image','slideshow'].includes(block.kind)?'<div class="builder-photos">'+(block.images||[]).map((url,n)=>'<div>'+imageTag(url,'Section image '+(n+1))+(block.kind==='slideshow'?'<label>Slide link (optional)<input data-slide-link="'+n+'" type="url" value="'+esc(block.links?.[n]||'')+'" placeholder="https://"></label>':'')+'<button data-remove-photo="'+n+'" aria-label="Remove image '+(n+1)+'">×</button></div>').join('')+'</div>'+uploadField('layout-media',block.kind==='slideshow'):'')+'</article>').join(''); };
  const move=(from,to)=>{if(from===to||!blocks[from]||!blocks[to]) return;blocks.splice(to,0,blocks.splice(from,1)[0]);dirty();render();};
  let dragged=-1;
  list.addEventListener('dragstart',event=>{const row=event.target.closest('[data-block]');if(row){dragged=Number(row.dataset.block);event.dataTransfer.setData('text/plain',String(dragged));}});
  list.addEventListener('dragend',()=>{dragged=-1;});
  list.addEventListener('dragover',event=>{if(dragged>=0)event.preventDefault();});
  list.addEventListener('drop',event=>{const row=event.target.closest('[data-block]');if(dragged>=0&&row){event.preventDefault();move(dragged,Number(row.dataset.block));dragged=-1;}});
  list.addEventListener('input',event=>{
    const field=event.target;
    if(!field.matches('[data-block-text],[data-slide-link]'))return;
    const block=blocks[Number(field.closest('[data-block]').dataset.block)];
    if(field.matches('[data-block-text]'))block.text=field.value;
    else{
      block.links??=[];
      block.links[Number(field.dataset.slideLink)]=field.value.trim();
    }
    dirty();
  });
  list.addEventListener('change',async event=>{
    if(event.target.matches('[data-slide-interval]')){
      blocks[Number(event.target.closest('[data-block]').dataset.block)].interval=Number(event.target.value);
      dirty();return;
    }
    if(event.target.name!=='layout-media')return;
    const block=blocks[Number(event.target.closest('[data-block]').dataset.block)];
    uploads++;sync();
    try{
      const files=Array.from(event.target.files);
      if(block.kind==='slideshow' && files.length+(block.images?.length||0)>10) throw new Error('Each slideshow can have up to 10 photos.');
      note('Uploading images…');
      const urls=await uploadMedia(files);
      if(!urls.length)return;
      block.images=block.kind==='image'?urls.slice(0,1):[...(block.images||[]),...urls];
      dirty();render();note('Images uploaded. Publish to show them on the storefront.');
    }catch(error){note(error.message,true);}finally{uploads--;sync();}
  });
  target.addEventListener('click',async event=>{
    const button=event.target.closest('button');
    if(!button)return;
    const row=button.closest('[data-block]'), index=row?Number(row.dataset.block):-1;
    if(button.dataset.addBlock){
      const kind=button.dataset.addBlock;
      if(blocks.length>=30 || (kind==='slideshow' && blocks.filter(b=>b.kind===kind).length>=content.slideshow_limit)){
        note('This store has reached its section limit.',true);return;
      }
      blocks.push({kind});dirty();render();list.lastElementChild?.scrollIntoView({block:'nearest'});
    } else if(button.dataset.move) move(index,index+Number(button.dataset.move));
    else if(button.hasAttribute('data-remove-block')){blocks.splice(index,1);dirty();render();}
    else if(button.dataset.removePhoto!==undefined){blocks[index].images.splice(Number(button.dataset.removePhoto),1);blocks[index].links?.splice(Number(button.dataset.removePhoto),1);dirty();render();}
    else if(button.hasAttribute('data-preview-layout')){
      openDialog('Draft preview · '+store.name,'<p class="muted">These changes are visible only to you until published.</p><div id="builder-preview"></div>');
      const preview=modal.querySelector('#builder-preview');
      const catalogue=document.createElement('section');
      catalogue.className='panel';catalogue.textContent='Product catalogue appears here.';
      appendPublishedBlocks(preview,catalogue,blocks);
    }else if(button.hasAttribute('data-save-layout')){
      if(saving||uploads)return;
      if(blocks.some(block=>block.links?.some(link=>link&&!safeImage(link))))return note('Slide links must use HTTPS.',true);
      const version=revision, snapshot=structuredClone(blocks);
      saving=true;sync();note('Publishing layout…');
      try{
        await updateContent(store.id,{blocks:snapshot},await getSessionToken());
        if(revision===version&&onSaved){await onSaved();return;}
        if(revision===version){
          note(store.active?'Published. Open the storefront Home tab to see your changes.':'Layout saved. It will appear when this store is active.');
          live.hidden=!store.active;
        }else note('Previous changes published. New edits are still unpublished.');
      }catch(error){note(error.message,true);}finally{saving=false;sync();}
    }
  });
  render();
}

document.addEventListener('submit',async event=>{
  const form=event.target;
  if(!['owner-profile','owner-product','owner-delete-product','admin-layout-limit'].includes(form.id))return;
  event.preventDefault();
  const button=form.querySelector('button:not([type=button])'),status=form.querySelector(':scope > [role=status]');
  if(button.disabled)return;
  button.disabled=true;
  status.textContent='Saving…';
  const data=new FormData(form);
  const value=key=>String(data.get(key)||'').trim();
  try{
    const token=await getSessionToken();
    if(form.id==='owner-delete-product'){
      const removed=await request('/rest/v1/products?id=eq.'+form.dataset.id+'&business_id=eq.'+ownerStore.id,{method:'DELETE',token,prefer:'return=representation'});
      if(removed?.length!==1)throw new Error('The product could not be removed.');
      if(canEditInlineStore()){await reloadInlineStore();modal.close();return;}
      modal.close();ownerDashboard();toast('Product deleted.');return;
    }
    if(form.id==='admin-layout-limit'){
      await updateContent(form.dataset.id,{slideshow_limit:Number(value('limit'))},token);
    }else if(form.id==='owner-profile'){
      const [logo]=await uploadMedia(data.getAll('logo'));
      await request('/rest/v1/businesses?id=eq.'+ownerStore.id,{method:'PATCH',token,data:{name:value('name'),description:value('description')}});
      await updateContent(ownerStore.id,{email:value('email'),phone:value('phone'),category:value('category'),...(logo?{logo}:{})},token);
      ownerStore.name=value('name');ownerStore.description=value('description');
      const logoImage=app.querySelector('.owner-brand img');
      if(logo&&logoImage)logoImage.src=logo;
      if(!storefrontPreview)signalStorefrontSave(ownerStore.slug);
    }else{
      const photos=photoDrafts.get(form.querySelector('.owner-photo-editor'));
      const [photo,...gallery]=photos?photos.urls:await uploadMedia(data.getAll('photo'));
      const product={name:value('name'),category:value('category'),description:value('description'),price_minor:Math.round(Number(value('price'))*100),active:data.has('active'),...(photo||photos?{image_url:photo||null,gallery}:{})};
      product.sale_price_minor=value('sale')?Math.round(Number(value('sale'))*100):null;
      product.sizes=value('sizes').split(',').map(s=>s.trim()).filter(Boolean);
      product.colours=value('colours').split(',').map(s=>s.trim()).filter(Boolean);
      product.stock=value('stock')?Number(value('stock')):null;
      const id=form.dataset.id;
      await request('/rest/v1/products'+(id?'?id=eq.'+id+'&business_id=eq.'+ownerStore.id:''),{method:id?'PATCH':'POST',token,data:id?product:{...product,business_id:ownerStore.id}});
      if(form.closest('.inline-store-editor')){await reloadInlineStore();if(modal.contains(form))modal.close();return;}
      modal.close();ownerDashboard();toast('Product saved.');return;
    }
    if(form.closest('.inline-store-editor')){await reloadInlineStore();modal.close();return;}
    status.textContent='Saved.';
  }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
});

async function openLayoutLimit(id){
  const store=adminStores.find(item=>item.id===id);
  if(!store)return;
  openDialog('Slideshow limit · '+store.name,'<p>Loading…</p>');
  try{
    const content=await contentFor(id,await getSessionToken());
    if(!modal.open)return;
    openDialog('Slideshow limit · '+store.name,'<form id="admin-layout-limit" data-id="'+id+'"><label>Maximum slideshows<input name="limit" type="number" min="0" max="10" required value="'+content.slideshow_limit+'"></label><button class="primary">Save limit</button><p role="status"></p></form>');
  }catch{if(modal.open)openDialog('Slideshow limit','<p>Could not load the limit.</p>');}
}

function renderPublishedLayout(homeConfig){
  if(!publishedContent)return;
  const shopHome=app.querySelector('.shop-content');
  if(shopHome){
    if(homeConfig?.order||business.demo_pack){
      const slides=shopHome.querySelector('[data-home-section=slideshow]');
      appendPublishedBlocks(slides,document.createDocumentFragment(),(publishedContent.blocks||[]).filter(block=>block.kind!=='catalogue'));
      arrangeShopHome(shopHome,homeConfig);
      return;
    }
    const catalogue=shopHome.querySelector('#products');
    const heading=shopHome.querySelector('#browse');
    if(!catalogue||!heading)return;
    const group=document.createElement('section');group.className='stack';group.append(heading,catalogue);
    appendPublishedBlocks(shopHome,group,publishedContent.blocks);return;
  }
  const {logo,email,phone,category,blocks}=publishedContent;
  const hero=app.querySelector('.hero section');
  if(hero){
    if(logo) hero.insertAdjacentHTML('afterbegin','<div class="store-logo">'+imageTag(logo,business.name+' logo')+'</div>');
    const details=[category,email,phone].filter(Boolean).map(esc).join(' · ');
    if(details)hero.insertAdjacentHTML('beforeend','<p>'+details+'</p>');
  }
  const heading=app.querySelector('#browse');
  if(!heading)return;
  const catalogue=document.createElement('section');
  catalogue.className='stack';
  catalogue.append(heading,heading.nextElementSibling,app.querySelector('#products'));
  appendPublishedBlocks(app,catalogue,blocks);
}

function appendPublishedBlocks(target,catalogue,blocks){
  for(const block of blocks||starterBlocks()){
    if(block.kind==='catalogue') target.append(catalogue);
    else if(block.kind==='text'&&block.text) target.insertAdjacentHTML('beforeend','<section class="panel store-copy">'+esc(block.text)+'</section>');
    else if(['image','slideshow'].includes(block.kind) && Array.isArray(block.images)){
      const images=block.images.map((url,i)=>{
        const image=imageTag(url,'Store image '+(i+1)),link=safeImage(block.links?.[i]);
        return image&&block.kind==='slideshow'&&link?'<a href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">'+image+'</a>':image;
      }).join('');
      if(!images)continue;
      if(block.kind==='image'){
        target.insertAdjacentHTML('beforeend','<section class="panel store-media" aria-label="Store photo">'+images+'</section>');continue;
      }
      const container=document.createElement('section');container.className='panel store-carousel';
      container.setAttribute('aria-label','Store slideshow');
      container.innerHTML='<div class="store-media store-slides" tabindex="0">'+images+'</div>';
      target.append(container);
      const rail=container.firstElementChild, slides=[...rail.children];
      if(slides.length<2)continue;
      const controls=document.createElement('div');controls.className='toolbar';
      controls.innerHTML='<button type="button" aria-label="Previous slide">←</button><button type="button">Pause</button><button type="button" aria-label="Next slide">→</button>';
      container.append(controls);
      const [previous,pause,next]=controls.children;
      let paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
      const reflect=()=>{pause.textContent=paused?'Play':'Pause';};
      const move=step=>{
        const index=slides.reduce((closest,slide,i)=>Math.abs(slide.offsetLeft-rail.scrollLeft)<Math.abs(slides[closest].offsetLeft-rail.scrollLeft)?i:closest,0);
        rail.scrollTo({left:slides[(index+step+slides.length)%slides.length].offsetLeft,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
      };
      previous.onclick=()=>{paused=true;reflect();move(-1);};
      next.onclick=()=>{paused=true;reflect();move(1);};
      pause.onclick=()=>{paused=!paused;reflect();};
      rail.addEventListener('pointerdown',()=>{paused=true;reflect();});
      reflect();
      const tick=()=>{
        if(!container.isConnected)return;
        if(!paused&&!document.hidden&&!container.matches(':hover')&&!rail.matches(':focus-within'))move(1);
        setTimeout(tick,(block.interval===5?5:3)*1000);
      };
      setTimeout(tick,(block.interval===5?5:3)*1000);
    }
  }
}

document.addEventListener('dragover',event=>{
  if(event.target.closest('.media-drop') && event.dataTransfer.types.includes('Files')) event.preventDefault();
});
document.addEventListener('drop',event=>{
  const field=event.target.closest('.media-drop');
  if(!field || !event.dataTransfer.files.length)return;
  event.preventDefault();
  const input=field.querySelector('input');
  const selection=new DataTransfer();
  for(const file of Array.from(event.dataTransfer.files).slice(0,input.multiple?11:1)) selection.items.add(file);
  input.files=selection.files;
  input.dispatchEvent(new Event('change',{bubbles:true}));
});

async function ownerStorePreview(target,token) {
  const store=ownerStore;
  const filter='&business_id=eq.'+store.id;
  const [profile,products,themes]=await Promise.all([
    contentFor(store.id,token),
    request('/rest/v1/products?select=id,name,category,description,price_minor,sale_price_minor,image_url,gallery,sizes,colours,stock,active&order=name'+filter,{token}),
    request('/rest/v1/store_themes?select=accent'+filter,{token})
  ]);
  if(!target.isConnected)return;
  const accent=/^#[0-9a-f]{6}$/i.test(themes[0]?.accent)?themes[0].accent:'#166047';
  const live=products.filter(p=>p.active);
  const sale=live.filter(p=>p.sale_price_minor);
  const categories=[...new Set(live.map(p=>p.category).filter(Boolean))];
  let page='home', selectedProduct, group='';
  const action=(tab,label)=>'<button data-owner-tab="'+tab+'">'+label+'</button>';
  const photo=p=>imageTag(p?.image_url,p?.name||'')||icon('bag','#166047');
  const priceLabel=p=>money((p.sale_price_minor||p.price_minor)/100);
  const cards=items=>'<div class="shop-grid">'+items.map(p=>'<article class="shop-card"><button class="shop-photo" data-preview-item="'+p.id+'">'+photo(p)+'</button><div class="shop-card-copy"><button data-preview-item="'+p.id+'">'+esc(p.name)+'</button><strong>'+priceLabel(p)+'</strong></div></article>').join('')+'</div>';
  const empty='<div class="panel"><p>Add and show products to see them here.</p>'+action('Products','Manage products')+'</div>';
  function render(){
    let content;
    if(page==='home'){
      content='<section class="shop-profile">'+(imageTag(profile.logo,store.name)||'<div class="shop-avatar owner-image-empty" aria-hidden="true"></div>')
        +'<label class="button owner-image-picker">Add image<input type="file" name="owner-preview-image" accept="image/jpeg,image/png,image/webp,image/gif"></label><p role="status" id="owner-image-status"></p>'
        +'<h1>'+esc(store.name)+'</h1><p>'+esc(store.description||'Your store description goes here.')+'</p>'
        +action('Business profile','Edit description')+'</section>'
        +'<section class="shop-sale"><strong>Store sale</strong><span>'+(sale.length?sale.length+' discounted products':'Set a sale price on a product to show this banner.')+'</span>'+action('Products','Edit sale prices')+'</section>'
        +'<div class="row shop-heading"><h2>Published page</h2>'+action('Store builder','Edit page layout')+'</div>'
        +'<div id="owner-published-sections"><section id="owner-preview-catalogue"><div class="row shop-heading"><h2>Featured</h2>'
        +action('Products','Manage products')+'</div>'+(live.length?cards(live.slice(0,4)):empty)+'</section></div>';
    }else if(page==='shop'){
      const items=group==='sale'?sale:group?live.filter(p=>p.category===group):live;
      content='<div class="row shop-heading"><h2>Shop</h2>'+action('Products','Manage products')+'</div>'+(items.length?cards(items):empty);
    }else if(page==='catalogue'){
      const groups=categories.map((name,i)=>[name,i,live.find(p=>p.category===name&&p.image_url)]);
      if(sale.length)groups.push(['Sale','sale',sale.find(p=>p.image_url)]);
      content='<div class="row shop-heading"><h2>Catalogue</h2>'+action('Products','Edit product categories')+'</div><div class="shop-collections">'
        +(groups.map(([name,id,p])=>'<button class="shop-collection" data-preview-group="'+id+'">'+(p?imageTag(p.image_url):'')+'<strong>'+esc(name)+'</strong><span>›</span></button>').join('')||'<p>Product categories appear here once you add them.</p>')+'</div>';
    }else if(page==='detail'&&selectedProduct){
      const p=selectedProduct;
      content='<div class="row shop-heading"><button data-preview-page="shop">← Shop</button><button data-preview-edit="'+p.id+'">Edit product</button></div>'
        +'<div class="shop-detail-photo">'+photo(p)+(p.gallery||[]).map(url=>imageTag(url,p.name)).join('')+'</div>'
        +'<h2>'+esc(p.name)+'</h2><strong>'+priceLabel(p)+'</strong><p>'+esc(p.description)+'</p>'
        +'<p class="muted">'+[...(p.sizes||[]),...(p.colours||[])].map(esc).join(' · ')+'</p>'
        +'<div class="shop-cta"><button disabled>Add to Cart</button><button disabled>Buy Now</button></div>';
    }else{
      content='<div class="row shop-heading"><h2>My cart</h2></div><div class="panel"><p>Your customers’ selected items and totals appear here.</p><button disabled>Checkout</button></div>';
    }
    target.innerHTML='<div class="row"><p class="muted">Owner preview · Shopping actions are disabled.</p>'
      +(store.active?'<a class="button" href="/'+store.slug+'">View live store ↗</a>':'<span class="badge">Storefront unavailable</span>')+'</div>'
      +'<div class="owner-preview shop-frame" style="--shop-tint:color-mix(in srgb,'+accent+' 16%,white);--shop-ink:color-mix(in srgb,'+accent+' 70%,#142d22)"><div class="owner-preview-content">'+content+'</div>'
      +'<nav class="shop-tabs" aria-label="Preview screens">'+[['home','Home'],['shop','Shop'],['catalogue','Catalogue'],['cart','Cart']].map(([id,label])=>'<button data-preview-page="'+id+'" '+(page===id?'aria-current="page"':'')+'>'+shopIcon(id)+'<span>'+label+'</span></button>').join('')+'</nav></div>';
    if(page==='home'){
      const sections=target.querySelector('#owner-published-sections');
      const catalogue=sections?.querySelector('#owner-preview-catalogue');
      if(catalogue){catalogue.remove();appendPublishedBlocks(sections,catalogue,profile.blocks);}
    }
  }
  target.addEventListener('change',async event=>{
    const input=event.target;
    if(input.name!=='owner-preview-image'||!input.files.length)return;
    const status=target.querySelector('#owner-image-status');
    input.disabled=true;
    status.textContent='Uploading image…';
    try{
      const [logo]=await uploadMedia(input.files);
      if(!logo)throw new Error('Choose an image file.');
      await updateContent(store.id,{logo},await getSessionToken());
      profile.logo=logo;
      if(page==='home'&&target.isConnected){
        render();
        target.querySelector('#owner-image-status').textContent='Image saved.';
      }
    }catch(error){status.textContent=error.message;}
    finally{input.disabled=false;input.value='';}
  });
  target.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(!button)return;
    const {previewPage,previewItem,previewGroup,previewEdit}=button.dataset;
    if(previewPage){page=previewPage;group='';}
    else if(previewItem){selectedProduct=live.find(p=>p.id===previewItem);if(!selectedProduct)return;page='detail';}
    else if(previewGroup!==undefined){group=previewGroup==='sale'?'sale':categories[Number(previewGroup)];page='shop';}
    else if(previewEdit){productEditor(live.find(p=>p.id===previewEdit));return;}
    else return;
    render();
  });
  render();
}

const trendoraColours={
 surface:'#F7F8F3',card:'#FFFFFF',sage:'#E3ECDB',photo:'#C6D4BB',primary:'#075C3A',
 buy:'#545A13',ink:'#13251B',muted:'#56645A',border:'#D8E2D4'
};
const trendoraCollections=['Hoodies & Sweats','Everyday Basics','Outerwear','Sale'];
const trendoraCover={ 'Hoodies & Sweats':'hoodie','Everyday Basics':'tee',Outerwear:'puffer',Sale:'desert' };
const trendoraAsset=name=>'https://www.enuxes.com/trendora-media/'+name+'.webp';

async function trendoraMerchEditor(target,token){
 const content=await contentFor(ownerStore.id,token);
 const merch=content.merchandising||{};
 const rows=await request('/rest/v1/products?select=id,name,category&business_id=eq.'+ownerStore.id+'&order=name',{token});
 const all=[...new Set([...trendoraCollections,...rows.map(p=>p.category).filter(Boolean),...(merch.collections||[]).map(c=>c.name)])];
 const collections=[...(merch.collections||[]),...all.filter(name=>!(merch.collections||[]).some(c=>c.name===name)).map(name=>({name,enabled:true,cover:trendoraCover[name]?trendoraAsset(trendoraCover[name]):''}))];
 if(!target.isConnected)return;
 target.innerHTML='<div class="panel"><h2>Trendora merchandising</h2><form id="trendora-merch">'+field('Sale banner title','bannerTitle',merch.bannerTitle||'Mid-season sale',100)
  +field('Banner image URL','bannerImage',merch.bannerImage||trendoraAsset('desert'),2048,'url')+uploadField('bannerUpload')
  +field('Banner destination (blank opens Sale)','bannerLink',merch.bannerLink,2048,'url')
  +'<label><span><input type="checkbox" name="bannerEnabled" '+(merch.bannerEnabled===false?'':'checked')+'> Show banner</span></label>'
  +'<div class="row">'+Object.entries(trendoraColours).map(([key,fallback])=>'<label>'+key+'<input name="theme-'+key+'" type="color" value="'+esc(/^#[a-f0-9]{6}$/i.test(merch.palette?.[key])?merch.palette[key]:fallback)+'"></label>').join('')+'</div>'
  +'<fieldset><legend>Featured products</legend>'+rows.map(p=>'<label><span><input name="featured" type="checkbox" value="'+p.id+'" '+((merch.featured||[]).includes(p.id)?'checked':'')+'> '+esc(p.name)+'</span></label>').join('')+'</fieldset>'
  +'<fieldset><legend>Collections</legend>'+collections.map((c,i)=>'<div class="panel stack"><strong>'+esc(c.name)+'</strong>'
  +'<label><span><input type="checkbox" name="visible-'+i+'" '+(c.enabled===false?'':'checked')+'> Published</span></label>'
  +'<label>Display order<input type="number" name="order-'+i+'" min="0" max="999" step="1" required value="'+i+'"></label>'
  +field('Cover URL','cover-'+i,c.cover,2048,'url')+uploadField('cover-upload-'+i)+'</div>').join('')+'</fieldset>'
  +'<button class="primary">Save merchandising</button><p role="status"></p></form></div>';
 const form=target.querySelector('form');
 form.onsubmit=async event=>{
  event.preventDefault();
  const button=form.querySelector('button:not([type=button])'),status=form.querySelector('[role=status]'), data=new FormData(form);
  const val=key=>String(data.get(key)||'').trim();
  const validUrl=url=>{if(url&&!safeImage(url))throw new Error('Use HTTPS image and destination links.');return url;};
  button.disabled=true;status.textContent='Saving…';
  try{
   const [banner]=await uploadMedia(data.getAll('bannerUpload'));
   const configured=await Promise.all(collections.map(async(c,i)=>{
    const [upload]=await uploadMedia(data.getAll('cover-upload-'+i));
    return {name:c.name,enabled:data.has('visible-'+i),cover:upload||validUrl(val('cover-'+i)),position:Number(val('order-'+i))};
   }));
   const latest=await contentFor(ownerStore.id,await getSessionToken());
   await updateContent(ownerStore.id,{merchandising:{
    ...latest.merchandising,
    bannerTitle:val('bannerTitle'),bannerImage:banner||validUrl(val('bannerImage')),bannerLink:validUrl(val('bannerLink')),bannerEnabled:data.has('bannerEnabled'),
    featured:data.getAll('featured'),palette:Object.fromEntries(Object.keys(trendoraColours).map(k=>[k,val('theme-'+k)])),
    collections:configured.sort((a,b)=>a.position-b.position)
   }},await getSessionToken());
   status.textContent='Saved. The storefront will refresh automatically.';
  }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
 };
}

async function trendoraDeliveryEditor(target,token){
 const [settings]=await request('/rest/v1/business_settings?select=delivery_fee_minor,delivery_enabled&business_id=eq.'+ownerStore.id,{token});
 if(!settings)throw new Error('Delivery settings are unavailable.');
 target.innerHTML='<div class="panel"><h2>Demo delivery</h2><form><label>Delivery fee (N$)<input name="fee" type="number" min="0" max="21474836.47" step=".01" required value="'+settings.delivery_fee_minor/100+'"></label><label><span><input name="enabled" type="checkbox" '+(settings.delivery_enabled?'checked':'')+'> Accept demo delivery orders</span></label><button class="primary">Save delivery</button><p role="status"></p></form></div>';
 const form=target.querySelector('form');
 form.onsubmit=async event=>{
  event.preventDefault();const status=form.querySelector('[role=status]'),button=form.querySelector('button'),data=new FormData(form);
  button.disabled=true;status.textContent='Saving…';
  try{
   const rows=await request('/rest/v1/business_settings?business_id=eq.'+ownerStore.id,{method:'PATCH',token:await getSessionToken(),prefer:'return=representation',data:{delivery_enabled:data.has('enabled'),delivery_fee_minor:Math.round(Number(data.get('fee'))*100)}});
   if(rows?.length!==1)throw new Error('Delivery settings were not saved.');
   status.textContent='Delivery settings saved.';
  }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
 };
}

function renderTrendoraOrders(target,orders){
 const statuses=['NEW','CONFIRMED','PROCESSING','OUT FOR DELIVERY','COMPLETED','CANCELLED'];
 target.innerHTML=orders.map(o=>'<article class="panel stack"><h3>#'+esc(o.id.slice(0,8).toUpperCase())+' · '+money(o.total_minor/100)+'</h3><p>'+esc(o.customer_name)+' · '+esc(o.mobile)+'<br>'+esc(o.address)+'</p>'
  +'<ul>'+(o.order_items||[]).map(line=>'<li>'+line.quantity+' × '+esc(line.product_name)+' '+esc([line.size,line.colour].filter(Boolean).join(' / '))+'</li>').join('')+'</ul>'
  +'<form data-trendora-order="'+o.id+'"><label>Fulfilment<select name="status">'+[...new Set([...statuses,o.status])].map(s=>'<option '+(s===o.status?'selected':'')+'>'+esc(s)+'</option>').join('')+'</select></label><button class="primary">Save status</button><p role="status"></p></form></article>').join('')||'<div class="panel">No recorded orders.</div>';
}
document.addEventListener('submit',async event=>{
 const form=event.target;if(!form.dataset.trendoraOrder)return;
 event.preventDefault();const button=form.querySelector('button:not([type=button])'),status=form.querySelector(':scope > [role=status]');
 button.disabled=true;status.textContent='Saving…';
 try{
  const rows=await request('/rest/v1/orders?id=eq.'+form.dataset.trendoraOrder+'&business_id=eq.'+ownerStore.id,{method:'PATCH',token:await getSessionToken(),prefer:'return=representation',data:{status:new FormData(form).get('status')}});
  if(rows?.length!==1)throw new Error('Order status was not saved.');
  status.textContent='Order status saved.';
 }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
});
