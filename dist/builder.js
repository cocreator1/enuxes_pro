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
function updateContent(id,changes,token) {
  return request('/rest/v1/store_content?business_id=eq.'+id,{method:'PATCH',token,data:changes});
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
  const title='<div class="row"><h2>Store builder</h2><button class="primary" data-save-layout>Publish layout</button></div>';
  target.innerHTML='<section class="panel stack">'+title+'<p>Drag to reorder sections, or use the up and down buttons.</p><div class="toolbar">'
    +['text','image','slideshow'].map(kind=>'<button data-add-block="'+kind+'">Add '+blockNames[kind].toLowerCase()+'</button>').join('')
    +'</div><small>Slideshow limit · '+content.slideshow_limit+'</small><div id="builder-blocks" class="stack"></div><p id="builder-status" role="status"></p></section>';
  const list=target.querySelector('#builder-blocks'), status=target.querySelector('#builder-status');
  const render=()=>{ list.innerHTML=blocks.map((block,i)=>'<article class="panel stack" data-block="'+i+'" draggable="true"><div class="row"><strong>'+esc(blockNames[block.kind])+'</strong>'
    +'<div class="toolbar"><button data-move="-1" aria-label="Move section up" '+(!i?'disabled':'')+'>↑</button><button data-move="1" aria-label="Move section down" '+(i===blocks.length-1?'disabled':'')+'>↓</button>'
    +(block.kind==='catalogue'?'':'<button data-remove-block>Remove</button>')+'</div></div>'
    +(block.kind==='text'?'<textarea aria-label="Paragraph" data-block-text maxlength="1800">'+esc(block.text)+'</textarea>':'')
    +(['image','slideshow'].includes(block.kind)?'<div class="builder-photos">'+(block.images||[]).map((url,n)=>'<div>'+imageTag(url,'Section image '+(n+1))+'<button data-remove-photo="'+n+'" aria-label="Remove image '+(n+1)+'">×</button></div>').join('')+'</div>'+uploadField('layout-media',block.kind==='slideshow'):'')+'</article>').join(''); };
  const move=(from,to)=>{if(from===to||!blocks[from]||!blocks[to]) return;blocks.splice(to,0,blocks.splice(from,1)[0]);render();};
  let dragged=-1;
  list.addEventListener('dragstart',event=>{const row=event.target.closest('[data-block]');if(row){dragged=Number(row.dataset.block);event.dataTransfer.setData('text/plain',String(dragged));}});
  list.addEventListener('dragend',()=>{dragged=-1;});
  list.addEventListener('dragover',event=>{if(dragged>=0)event.preventDefault();});
  list.addEventListener('drop',event=>{const row=event.target.closest('[data-block]');if(dragged>=0&&row){event.preventDefault();move(dragged,Number(row.dataset.block));dragged=-1;}});
  list.addEventListener('input',event=>{if(event.target.matches('[data-block-text]')) blocks[Number(event.target.closest('[data-block]').dataset.block)].text=event.target.value;});
  list.addEventListener('change',async event=>{
    if(event.target.name!=='layout-media')return;
    const block=blocks[Number(event.target.closest('[data-block]').dataset.block)];
    try{
      const files=Array.from(event.target.files);
      if(block.kind==='slideshow' && files.length+(block.images?.length||0)>10) throw new Error('Each slideshow can have up to 10 photos.');
      status.textContent='Uploading…';
      const urls=await uploadMedia(files);
      if(!urls.length)return;
      block.images=block.kind==='image'?urls.slice(0,1):[...(block.images||[]),...urls];
      render();status.textContent='Images uploaded. Publish to show them on the storefront.';
    }catch(error){status.textContent=error.message;}
  });
  target.addEventListener('click',async event=>{
    const button=event.target.closest('button');
    if(!button)return;
    const row=button.closest('[data-block]'), index=row?Number(row.dataset.block):-1;
    if(button.dataset.addBlock){
      const kind=button.dataset.addBlock;
      if(blocks.length>=30 || (kind==='slideshow' && blocks.filter(b=>b.kind===kind).length>=content.slideshow_limit)){
        status.textContent='This store has reached its section limit.';return;
      }
      blocks.push({kind});render();
    } else if(button.dataset.move) move(index,index+Number(button.dataset.move));
    else if(button.hasAttribute('data-remove-block')){blocks.splice(index,1);render();}
    else if(button.dataset.removePhoto!==undefined){blocks[index].images.splice(Number(button.dataset.removePhoto),1);render();}
    else if(button.hasAttribute('data-save-layout')){
      button.disabled=true;
      try{await updateContent(ownerStore.id,{blocks},await getSessionToken());status.textContent='Layout published.';}
      catch(error){status.textContent=error.message;}finally{button.disabled=false;}
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
