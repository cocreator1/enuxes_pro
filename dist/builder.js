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
    target.innerHTML='<section class="panel stack"><div class="row"><h2>Products</h2><button id="owner-add-product">Add product</button></div>'
      +(rows.map((row,i)=>'<div class="row line"><span>'+esc(row.name)+'</span><button data-product-edit="'+i+'">Edit</button></div>').join('')||'<p>No products yet.</p>')+'</section>';
    target.addEventListener('click',event=>{
      const button=event.target.closest('button');
      if(!button) return;
      if(button.id==='owner-add-product') productEditor();
      if(button.dataset.productEdit!==undefined) productEditor(rows[Number(button.dataset.productEdit)]);
    });
    return;
  }
  const content=await contentFor(ownerStore.id,token);
  if(tab==='Business profile'){
    target.innerHTML='<div class="panel"><h2>Business profile</h2><form id="owner-profile">'
      +field('Business name','name',ownerStore.name,100,'text',true)+field('Category','category',content.category,80)
      +'<label>Description<textarea name="description" maxlength="1000">'+esc(ownerStore.description)+'</textarea></label>'
      +field('Public email','email',content.email,254,'email')+field('Public phone','phone',content.phone,80,'tel')
      +imageTag(content.logo,'Current business logo')+uploadField('logo')+'<div><button class="primary">Save profile</button></div><p role="status"></p></form></div>';
    return;
  }
  layoutEditor(target,content);
}

function productEditor(product={}){
  openDialog(product.id?'Edit product':'Add product','<form id="owner-product" data-id="'+(product.id||'')+'">'
    +field('Product name','name',product.name,100,'text',true)+field('Category','category',product.category,80,'text',true)
    +'<label>Description<textarea name="description" maxlength="1000">'+esc(product.description)+'</textarea></label>'
    +'<label>Price (N$)<input name="price" type="number" min=".01" max="21474836.47" step=".01" required value="'+(product.price_minor?product.price_minor/100:'')+'"></label>'
    +'<label>Sale price (N$)<input name="sale" type="number" min=".01" max="21474836.47" step=".01" value="'+(product.sale_price_minor?product.sale_price_minor/100:'')+'"></label>'
    +field('Sizes (comma separated)','sizes',product.sizes?.join(', '),240)
    +field('Colours (comma separated)','colours',product.colours?.join(', '),240)
    +'<label>Stock (blank if untracked)<input name="stock" type="number" min="0" max="2147483647" step="1" value="'+esc(product.stock)+'"></label>'
    +imageTag(product.image_url,'Current product photo')+uploadField('photo',true)+'<small>Select up to 10 photos to replace the gallery. The first is the cover.</small>'
    +'<label><span><input type="checkbox" name="active" '+(product.active===false?'':'checked')+'> Show in catalogue</span></label>'
    +'<button class="primary">Save product</button><p role="status"></p></form>');
}

function layoutEditor(target,content){
  const blocks=structuredClone(content.blocks || starterBlocks());
  const store=ownerStore;
  target.innerHTML='<section class="panel stack builder-shell"><div class="builder-publish"><div class="row"><div><h2>Page sections</h2><small>Arrange what appears on your storefront Home tab.</small></div>'
    +'<div class="toolbar"><button data-preview-layout>Preview draft</button><button class="primary" data-save-layout>Publish layout</button></div></div>'
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
    +(['image','slideshow'].includes(block.kind)?'<div class="builder-photos">'+(block.images||[]).map((url,n)=>'<div>'+imageTag(url,'Section image '+(n+1))+'<button data-remove-photo="'+n+'" aria-label="Remove image '+(n+1)+'">×</button></div>').join('')+'</div>'+uploadField('layout-media',block.kind==='slideshow'):'')+'</article>').join(''); };
  const move=(from,to)=>{if(from===to||!blocks[from]||!blocks[to]) return;blocks.splice(to,0,blocks.splice(from,1)[0]);dirty();render();};
  let dragged=-1;
  list.addEventListener('dragstart',event=>{const row=event.target.closest('[data-block]');if(row){dragged=Number(row.dataset.block);event.dataTransfer.setData('text/plain',String(dragged));}});
  list.addEventListener('dragend',()=>{dragged=-1;});
  list.addEventListener('dragover',event=>{if(dragged>=0)event.preventDefault();});
  list.addEventListener('drop',event=>{const row=event.target.closest('[data-block]');if(dragged>=0&&row){event.preventDefault();move(dragged,Number(row.dataset.block));dragged=-1;}});
  list.addEventListener('input',event=>{if(event.target.matches('[data-block-text]')){blocks[Number(event.target.closest('[data-block]').dataset.block)].text=event.target.value;dirty();}});
  list.addEventListener('change',async event=>{
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
    else if(button.dataset.removePhoto!==undefined){blocks[index].images.splice(Number(button.dataset.removePhoto),1);dirty();render();}
    else if(button.hasAttribute('data-preview-layout')){
      openDialog('Draft preview · '+store.name,'<p class="muted">These changes are visible only to you until published.</p><div id="builder-preview"></div>');
      const preview=modal.querySelector('#builder-preview');
      const catalogue=document.createElement('section');
      catalogue.className='panel';catalogue.textContent='Product catalogue appears here.';
      appendPublishedBlocks(preview,catalogue,blocks);
    }else if(button.hasAttribute('data-save-layout')){
      if(saving||uploads)return;
      const version=revision, snapshot=structuredClone(blocks);
      saving=true;sync();note('Publishing layout…');
      try{
        await updateContent(store.id,{blocks:snapshot},await getSessionToken());
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
  if(!['owner-profile','owner-product','admin-layout-limit'].includes(form.id))return;
  event.preventDefault();
  const button=form.querySelector('button'),status=form.querySelector('[role=status]');
  button.disabled=true;
  const data=new FormData(form);
  const value=key=>String(data.get(key)||'').trim();
  try{
    const token=await getSessionToken();
    if(form.id==='admin-layout-limit'){
      await updateContent(form.dataset.id,{slideshow_limit:Number(value('limit'))},token);
    }else if(form.id==='owner-profile'){
      const [logo]=await uploadMedia(data.getAll('logo'));
      await request('/rest/v1/businesses?id=eq.'+ownerStore.id,{method:'PATCH',token,data:{name:value('name'),description:value('description')}});
      await updateContent(ownerStore.id,{email:value('email'),phone:value('phone'),category:value('category'),...(logo?{logo}:{})},token);
      ownerStore.name=value('name');ownerStore.description=value('description');
    }else{
      const [photo,...gallery]=await uploadMedia(data.getAll('photo'));
      const product={name:value('name'),category:value('category'),description:value('description'),price_minor:Math.round(Number(value('price'))*100),active:data.has('active'),...(photo?{image_url:photo,gallery}:{})};
      product.sale_price_minor=value('sale')?Math.round(Number(value('sale'))*100):null;
      product.sizes=value('sizes').split(',').map(s=>s.trim()).filter(Boolean);
      product.colours=value('colours').split(',').map(s=>s.trim()).filter(Boolean);
      product.stock=value('stock')?Number(value('stock')):null;
      const id=form.dataset.id;
      await request('/rest/v1/products'+(id?'?id=eq.'+id+'&business_id=eq.'+ownerStore.id:''),{method:id?'PATCH':'POST',token,data:id?product:{...product,business_id:ownerStore.id}});
      modal.close();ownerDashboard();toast('Product saved.');return;
    }
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

function renderPublishedLayout(){
  if(!publishedContent)return;
  const shopHome=app.querySelector('.shop-content');
  if(shopHome){
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
      const images=block.images.map((url,i)=>imageTag(url,'Store image '+(i+1))).join('');
      if(images)target.insertAdjacentHTML('beforeend','<section tabindex="0" aria-label="'+(block.kind==='slideshow'?'Swipe through store photos':'Store photo')+'" class="panel store-media '+(block.kind==='slideshow'?'store-slides':'')+'">'+images+'</section>');
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
