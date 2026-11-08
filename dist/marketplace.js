const marketPath='/rest/v1/marketplace_';
const marketRank=(rows,id)=>rows.get(id)??Infinity;
const sortMarket=(stores,rows)=>stores.slice().sort((a,b)=>marketRank(rows,a.id)-marketRank(rows,b.id)||a.name.localeCompare(b.name)||a.slug.localeCompare(b.slug));

async function marketplace(){
  const [stores,order,banners,landing]=await Promise.all([
    request('/rest/v1/businesses?select='+businessColumns+'&active=eq.true&marketplace_listed=eq.true'),
    request(marketPath+'store_order?select=business_id,position'),
    request(marketPath+'banners?select=id,title,image_url,link_url&enabled=eq.true&order=position,id'),
    readLanding().catch(()=>({}))
  ]);
  const sorted=sortMarket(stores,new Map(order.map(row=>[row.business_id,row.position])));
  const cards=sorted.map(store=>'<article class="panel stack"><small>'+esc(store.type.replaceAll('_',' '))+'</small><h3>'+esc(store.name)+'</h3><p>'+esc(store.description)+'</p><a class="button" href="/'+esc(store.slug)+'">Visit store ↗</a></article>').join('');
  const home='<div class="market-banners">'+banners.map(banner=>{
    const img=imageTag(banner.image_url,banner.title);
    return banner.link_url?'<a href="'+esc(banner.link_url)+'" rel="noopener">'+img+'</a>':img;
  }).join('')+'</div><h2 id="market-businesses">'+esc(landingText(landing,'businesses'))+'</h2><div class="grid">'+(cards||'<p>No stores are open yet.</p>')+'</div>';
  app.innerHTML=landingHero(landing)+landingBlocks(landing)+landingSearch(landing)
    +'<div id="market-results" aria-live="polite">'+home+'</div>';
  const form=app.querySelector('#market-search'),results=app.querySelector('#market-results');
  let sequence=0;
  form.addEventListener('reset',()=>{sequence++;results.innerHTML=home;});
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const q=form.elements.query.value.trim(),run=++sequence;
    if(!q){results.innerHTML=home;return;}
    results.textContent='Searching…';
    try{
      const matches=await request('/rest/v1/rpc/marketplace_search',{method:'POST',data:{p_query:q}});
      if(run!==sequence)return;
      results.innerHTML='<h2>Search results</h2><div class="grid">'+(matches.map(item=>'<article class="panel stack"><small>'+esc(item.category)+'</small><h3>'+esc(item.listing_name||item.store_name)+'</h3>'
        +(item.listing_name?'<p>'+esc(item.store_name)+'</p>':'')+'<a class="button" href="/'+esc(item.slug)+'">Open store ↗</a></article>').join('')||'<p>No matching stores or listings.</p>')+'</div>';
    }catch{if(run===sequence)results.textContent='Search could not load. Try again.';}
  });
}

async function marketplaceAdmin(target){
  const token=await getSessionToken();
  const [ranks,initialBanners,landing]=await Promise.all([
    request(marketPath+'store_order?select=*',{token}),
    request(marketPath+'banners?select=*&order=position,id',{token}),
    readLanding(token)
  ]);
  if(!target.isConnected)return;
  const stores=sortMarket(adminStores.filter(store=>store.lifecycle==='active'&&store.id!=='a0100000-0000-4000-8000-000000000001'),new Map(ranks.map(row=>[row.business_id,row.position])));
  target.innerHTML='<section id="market-landing-editor" class="panel stack"></section><section class="panel stack"><div class="row"><h2>Marketplace banners</h2><button data-market-banner="new">Add banner</button></div><div id="market-banner-list"></div></section>'
    +'<section class="panel stack"><h2>Homepage store order</h2><p>Move stores up or down. Newly activated stores appear after your ordered list.</p><div id="market-order"></div><div><button class="primary" id="market-save-order">Save store order</button></div><p role="status" id="market-order-status"></p></section>';
  landingEditor(target.querySelector('#market-landing-editor'),landing);
  let banners=initialBanners;
  const order=target.querySelector('#market-order'),bannerList=target.querySelector('#market-banner-list');
  function render(){
    order.innerHTML=stores.map((store,i)=>'<div class="line row"><strong>'+(i+1)+'. '+esc(store.name)+'</strong><div class="toolbar">'
      +'<button data-market-move="-1" data-index="'+i+'" aria-label="Move '+esc(store.name)+' up" '+(!i?'disabled':'')+'>↑</button><button data-market-move="1" data-index="'+i+'" aria-label="Move '+esc(store.name)+' down" '+(i===stores.length-1?'disabled':'')+'>↓</button></div></div>').join('')||'<p>No active stores.</p>';
    bannerList.innerHTML=banners.map(banner=>'<div class="row line"><div><strong>'+esc(banner.title)+'</strong><br><small>Position '+banner.position+' · '+(banner.enabled?'Visible':'Hidden')+'</small></div><button data-market-banner="'+banner.id+'">Edit banner</button></div>').join('')||'<p>No banners yet.</p>';
  }
  render();
  target.onclick=async event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.marketBanner){
      editMarketBanner(banners.find(b=>b.id===button.dataset.marketBanner),async()=>{banners=await request(marketPath+'banners?select=*&order=position,id',{token:await getSessionToken()});if(target.isConnected)render();});return;
    }
    if(button.dataset.marketMove){
      const i=Number(button.dataset.index),j=i+Number(button.dataset.marketMove);
      [stores[i],stores[j]]=[stores[j],stores[i]];render();
      target.querySelector('#market-order-status').textContent='Unsaved order changes.';return;
    }
    if(button.id!=='market-save-order')return;
    const status=target.querySelector('#market-order-status');
    if(!stores.length){status.textContent='There are no active stores to arrange.';return;}
    button.disabled=true;order.inert=true;status.textContent='Saving…';
    try{
      const saved=await request(marketPath+'store_order?on_conflict=business_id',{method:'POST',token:await getSessionToken(),prefer:'resolution=merge-duplicates,return=representation',data:stores.map((store,position)=>({business_id:store.id,position}))});
      if(saved?.length!==stores.length)throw new Error('The full store order could not be saved.');
      status.textContent='Marketplace store order saved.';
    }catch(error){status.textContent=error.message;}finally{button.disabled=false;order.inert=false;}
  };
}

function editMarketBanner(banner={},refresh){
  openDialog(banner.id?'Edit marketplace banner':'Add marketplace banner','<form id="market-banner-form">'
    +field('Banner title','title',banner.title,120,'text',true)+field('Image URL (optional if uploading)','image_url',banner.image_url,2048,'url')
    +'<label>Upload banner image<input name="image" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label>'
    +field('Destination URL (optional)','link_url',banner.link_url,2048,'url')
    +'<label>Position (lower numbers first)<input name="position" type="number" min="0" max="2147483647" step="1" required value="'+(banner.position??0)+'"></label>'
    +'<label><span><input type="checkbox" name="enabled" '+(banner.enabled===false?'':'checked')+'> Show banner</span></label><button class="primary">Save banner</button><p role="status"></p></form>');
  const form=modal.querySelector('#market-banner-form');
  form.onsubmit=async event=>{
    event.preventDefault();
    const data=new FormData(form),status=form.querySelector('[role=status]'),button=form.querySelector('button');
    button.disabled=true;status.textContent='Saving…';
    try{
      const token=await getSessionToken();
      let image=data.get('image_url').trim();
      const file=data.get('image');
      if(file.size){
        if(file.size>5242880||!allowedImages.includes(file.type))throw new Error('Choose a JPG, PNG, WebP or GIF under 5 MB.');
        const path=crypto.randomUUID();
        const response=await fetch(apiRoot+'/storage/v1/object/marketplace-media/'+path,{method:'POST',headers:{apikey:publicKey,Authorization:'Bearer '+token,'Content-Type':file.type},body:file});
        if(!response.ok)throw new Error('Banner upload failed.');
        image=apiRoot+'/storage/v1/object/public/marketplace-media/'+path;
        form.elements.image_url.value=image;form.elements.image.value='';
      }
      const link=data.get('link_url').trim();
      if(!safeImage(image)||(link&&!safeImage(link)))throw new Error('Use HTTPS for the banner image and destination.');
      const saved=await request(marketPath+'banners'+(banner.id?'?id=eq.'+banner.id:''),{method:banner.id?'PATCH':'POST',token,prefer:'return=representation',data:{title:data.get('title').trim(),image_url:image,link_url:link,position:Number(data.get('position')),enabled:data.has('enabled')}});
      if(saved?.length!==1)throw new Error('Banner was not saved.');
      if(modal.contains(form))modal.close();
      toast('Marketplace banner saved.');
      await refresh();
    }catch(error){if(form.isConnected)status.textContent=error.message;else toast('Saved. Reopen Marketplace to refresh the list.');}finally{button.disabled=false;}
  };
}

const landingEndpoint=marketPath+'landing?id=eq.1';
const landingFields={
 badge:['Marketplace label','ENUXES MARKETPLACE'],
 title:['Headline','Find it local.'],
 intro:['Introduction','Discover stores, products and services on eNuxes.'],
 search:['Search label','Search the marketplace'],
 placeholder:['Search placeholder','Try hoodies, a store name or a service'],
 searchButton:['Search button','Search'],
 clearButton:['Clear button','Clear'],
 businesses:['Businesses heading','Explore businesses']
};
const landingKinds={button:'Button',tab:'Tab',text:'Text',image:'Image'};
const landingText=(content,key)=>content[key]??landingFields[key][1];
const landingLink=url=>typeof url==='string'&&(/^(?:https:\/\/[^\s]+|\/(?![\/\\])[^\s\\]*|#[a-z][a-z0-9-]*)$/i.test(url))?url:'';
async function readLanding(token){
 const [row]=await request(landingEndpoint+'&select=content',{token});
 return row?.content||{};
}
function landingDots(key,label,editing){
 return editing?'<button type="button" class="visual-dots" data-landing-edit="'+esc(key)+'" aria-label="Edit '+esc(label)+'">⋯</button>':'';
}
function landingHero(content,editing=false){
 const dots=key=>landingDots(key,landingFields[key][0],editing);
 return '<div class="hero"><section><span class="badge">'+esc(landingText(content,'badge'))+'</span>'+dots('badge')
  +'<h1>'+esc(landingText(content,'title'))+'</h1>'+dots('title')+'<p>'+esc(landingText(content,'intro'))+'</p>'+dots('intro')
  +'</section><div class="hero-art">'+(imageTag(content.heroImage,'Marketplace hero')||icon('bag','#bdd0ff'))+landingDots('heroImage','hero image',editing)+'</div></div>';
}
function landingBlocks(content,editing=false){
 const blocks=Array.isArray(content.blocks)?content.blocks:[];
 return ['tab','button','text','image'].map(kind=>{
  const entries=blocks.map((block,index)=>{
   if(block.kind!==kind)return '';
   const link=landingLink(block.url);
   const body=kind==='image'?imageTag(block.image,block.label):kind==='text'?'<p>'+esc(block.label)+'</p>':esc(block.label);
   const node=link&&!editing?'<a class="button" href="'+esc(link)+'">'+body+'</a>':kind==='button'||kind==='tab'?'<span class="button">'+body+'</span>':body;
   return '<div class="landing-item">'+node+landingDots('block:'+index,block.label||kind,editing)+'</div>';
  }).join('');
  return entries?'<div class="landing-'+kind+'">'+entries+'</div>':'';
 }).join('');
}
function landingSearch(content,editing=false){
 const dots=key=>landingDots(key,landingFields[key][0],editing);
 return '<form id="market-search" class="panel market-search"><label>'+esc(landingText(content,'search'))
  +'<input name="query" type="search" maxlength="100" placeholder="'+esc(landingText(content,'placeholder'))+'" '+(editing?'disabled':'')+'></label>'
  +dots('search')+dots('placeholder')+'<button class="primary" type="'+(editing?'button':'submit')+'">'+esc(landingText(content,'searchButton'))+'</button>'
  +dots('searchButton')+'<button type="'+(editing?'button':'reset')+'">'+esc(landingText(content,'clearButton'))+'</button>'+dots('clearButton')+'</form>';
}
function landingEditor(target,initial){
 let content=initial;
 const render=()=>{
  target.innerHTML='<h2>Panel 0 landing page</h2><p>Tap ⋯ to edit. Saved changes appear on the public homepage.</p>'
   +'<div class="toolbar">'+Object.entries(landingKinds).map(([kind,label])=>'<button type="button" data-landing-edit="new:'+kind+'">Add '+label.toLowerCase()+'</button>').join('')+'</div>'
   +landingHero(content,true)+landingBlocks(content,true)+landingSearch(content,true)
   +'<div class="row"><h2>'+esc(landingText(content,'businesses'))+'</h2>'+landingDots('businesses','businesses heading',true)+'</div>';
 };
 render();
 target.addEventListener('click',event=>{
  const key=event.target.closest('[data-landing-edit]')?.dataset.landingEdit;
  if(!key)return;
  const index=key.startsWith('block:')?Number(key.slice(6)):-1;
  const existing=content.blocks?.[index];
  const kind=existing?.kind||(key.startsWith('new:')?key.slice(4):'');
  const image=key==='heroImage'||kind==='image';
  const link=kind==='button'||kind==='tab'||kind==='image';
  const title=landingFields[key]?.[0]||(key==='heroImage'?'Hero image':landingKinds[kind]);
  openDialog(title,'<form id="landing-editor-form">'
   +(kind==='text'?'<label>Text<textarea name="label" maxlength="1000" required>'+esc(existing?.label)+'</textarea></label>':key==='heroImage'?'':field(title,'label',existing?.label??(kind?'':landingText(content,key)),kind==='image'?120:240,'text',kind!=='image'))
   +(link?field('Destination','url',existing?.url,500,'text',kind!=='image'):'')
   +(image?field('Image URL','imageUrl',existing?.image??content.heroImage,2048,'url')+'<label>Upload image<input name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label>':'')
   +'<p role="status"></p><div class="toolbar"><button type="submit" class="primary">Save Changes</button>'
   +(existing?'<button type="button" data-remove-landing>Remove</button>':'')+'</div></form>');
  const form=modal.querySelector('#landing-editor-form');
  const save=async remove=>{
   const status=form.querySelector('[role=status]');
   const data=new FormData(form),get=name=>String(data.get(name)||'').trim();
   const buttons=[...form.querySelectorAll('button')];
   buttons.forEach(button=>button.disabled=true);
   status.textContent='Saving…';
   try{
    const token=await getSessionToken();
    const next={...content};
    if(kind){
     const blocks=[...(content.blocks||[])];
     if(remove)blocks.splice(index,1);
     else{
      if(index<0&&blocks.length>=30)throw new Error('You can add up to 30 sections and links.');
      const url=get('url'),label=get('label');
      if(kind!=='image'&&!label)throw new Error('Enter a name or text.');
      if((url||kind==='tab'||kind==='button')&&!landingLink(url))throw new Error('Use an HTTPS link, a site path, or #market-businesses.');
      const entry={kind,label,url};
      if(image)entry.image=await landingImage(form,token,true);
      if(index<0)blocks.push(entry);else blocks[index]=entry;
     }
     next.blocks=blocks;
    }else if(image)next.heroImage=await landingImage(form,token,false);
    else{
     if(!get('label'))throw new Error('Enter text before saving.');
     next[key]=get('label');
    }
    const [saved]=await request(landingEndpoint,{method:'PATCH',token,prefer:'return=representation',data:{content:next}});
    if(!saved)throw new Error('Changes were not saved. Check Main Admin access.');
    content=saved.content;
    render();
    if(form.isConnected)modal.close();
    toast('Landing page saved.');
   }catch(error){status.textContent=error.message;}finally{buttons.forEach(button=>button.disabled=false);}
  };
  form.onsubmit=event=>{event.preventDefault();save(false);};
  form.querySelector('[data-remove-landing]')?.addEventListener('click',()=>save(true));
 });
}

async function landingImage(form,token,required){
 const file=form.elements.image.files[0];
 let url=form.elements.imageUrl.value.trim();
 if(file){
  if(!file.size||file.size>5242880||!allowedImages.includes(file.type))throw new Error('Choose a JPG, PNG, WebP or GIF under 5 MB.');
  const path=crypto.randomUUID();
  const response=await fetch(apiRoot+'/storage/v1/object/marketplace-media/'+path,{method:'POST',headers:{apikey:publicKey,Authorization:'Bearer '+token,'Content-Type':file.type},body:file});
  if(!response.ok)throw new Error('Image upload failed.');
  url=apiRoot+'/storage/v1/object/public/marketplace-media/'+path;
  form.elements.imageUrl.value=url;
  form.elements.image.value='';
 }
 if((url||required)&&!safeImage(url))throw new Error('Upload an image or enter an HTTPS image URL.');
 return url;
}
