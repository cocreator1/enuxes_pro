const marketPath='/rest/v1/marketplace_';
const marketRank=(rows,id)=>rows.get(id)??Infinity;
const sortMarket=(stores,rows)=>stores.slice().sort((a,b)=>marketRank(rows,a.id)-marketRank(rows,b.id)||a.name.localeCompare(b.name)||a.slug.localeCompare(b.slug));

async function marketplace(){
  const [stores,order,banners]=await Promise.all([
    request('/rest/v1/businesses?select='+businessColumns+'&active=eq.true&marketplace_listed=eq.true'),
    request(marketPath+'store_order?select=business_id,position'),
    request(marketPath+'banners?select=id,title,image_url,link_url&enabled=eq.true&order=position,id')
  ]);
  const sorted=sortMarket(stores,new Map(order.map(row=>[row.business_id,row.position])));
  const cards=sorted.map(store=>'<article class="panel stack"><small>'+esc(store.type.replaceAll('_',' '))+'</small><h3>'+esc(store.name)+'</h3><p>'+esc(store.description)+'</p><a class="button" href="/'+esc(store.slug)+'">Visit store ↗</a></article>').join('');
  const home='<div class="market-banners">'+banners.map(banner=>{
    const img=imageTag(banner.image_url,banner.title);
    return banner.link_url?'<a href="'+esc(banner.link_url)+'" rel="noopener">'+img+'</a>':img;
  }).join('')+'</div><h2>Explore businesses</h2><div class="grid">'+(cards||'<p>No stores are open yet.</p>')+'</div>';
  app.innerHTML='<div class="hero"><section><span class="badge">ENUXES MARKETPLACE</span><h1>Find it local.</h1><p>Discover stores, products and services on eNuxes.</p></section><div class="hero-art">'+icon('bag','#bdd0ff')+'</div></div>'
    +'<form id="market-search" class="panel market-search"><label>Search the marketplace<input name="query" type="search" maxlength="100" placeholder="Try hoodies, a store name or a service"></label><button class="primary">Search</button><button type="reset">Clear</button></form><div id="market-results" aria-live="polite">'+home+'</div>';
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
  const [ranks,initialBanners]=await Promise.all([
    request(marketPath+'store_order?select=*',{token}),
    request(marketPath+'banners?select=*&order=position,id',{token})
  ]);
  if(!target.isConnected)return;
  const stores=sortMarket(adminStores.filter(store=>store.lifecycle==='active'&&store.id!=='a0100000-0000-4000-8000-000000000001'),new Map(ranks.map(row=>[row.business_id,row.position])));
  target.innerHTML='<section class="panel stack"><div class="row"><h2>Marketplace banners</h2><button data-market-banner="new">Add banner</button></div><div id="market-banner-list"></div></section>'
    +'<section class="panel stack"><h2>Homepage store order</h2><p>Move stores up or down. Newly activated stores appear after your ordered list.</p><div id="market-order"></div><div><button class="primary" id="market-save-order">Save store order</button></div><p role="status" id="market-order-status"></p></section>';
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
