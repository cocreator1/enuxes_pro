const shopIcons={
 home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-6h6v6"/>',
 shop:'<path d="M4 10v10h16V10M3 10l2-6h14l2 6M3 10c0 3 4 3 4 0 0 3 5 3 5 0 0 3 5 3 5 0 0 3 4 3 4 0"/>',
 catalogue:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
 cart:'<path d="M2 3h3l3 13h11l3-9H6"/><circle cx="9" cy="21" r="1"/><circle cx="18" cy="21" r="1"/>',
 heart:'<path d="M12 21 4 13C-2 7 6 0 12 7c6-7 14 0 8 6z"/>',
 search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
 people:'<circle cx="9" cy="8" r="3"/><path d="M2 20v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2m1-15a3 3 0 0 1 0 6m1 3c3 0 4 2 4 6"/>'
};
const shopIcon=name=>'<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">'+shopIcons[name]+'</svg>';
let shopPage='home',shopFilter='',shopSearch='',shopOnlyFav=false,shopOnlySale=false,shopInfo={},shopCart=[],shopFav=[],shopDevice,shopRequest;
let checkoutInFlight=false, instantOrder=null, shopSort='', shopStock=false, shopSize='';
const isTrendora=()=>business?.id==='a0100000-0000-4000-8000-000000000001';
const shopUnit=p=>p.sale_price_minor||p.price_minor;
const orderTotal=lines=>lines.reduce((sum,line)=>sum+shopUnit(getProduct(line.id))*line.quantity,0);
function showCheckout(lines,key,buyNow=false){
 if(!lines.length||!shopInfo.collection)return;
 if(lines.some(line=>!getProduct(line.id)))return toast('An item is no longer available.');
 const fee=isTrendora()?shopInfo.delivery_fee:0;
 if(isTrendora()&&fee==null)return toast('Demo delivery is unavailable.');
 const total=orderTotal(lines)+(fee||0);
 instantOrder={lines:structuredClone(lines),key,buyNow,total};
 modal.className='shop-sheet';
 openDialog('Checkout','<form id="shop-order"><p>'+(isTrendora()?'Demo delivery order · No payment is collected.':'Pay when you collect your order.')+' <strong>'+money(total/100)+'</strong></p>'
  +'<label>Name<input name="name" autocomplete="name" maxlength="100" required></label><label>Mobile<input name="mobile" type="tel" autocomplete="tel" minlength="5" maxlength="30" required></label>'
  +(isTrendora()?'<label>Sample delivery address<input name="address" minlength="5" maxlength="250" autocomplete="street-address" required></label>':'')
  +'<button class="primary">'+(isTrendora()?'Place demo order':'Place collection order')+'</button><p role="status"></p></form>');
}

const cartKey=()=> 'enuxes-shop-'+business.id;
function loadSaved(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function saveShop(){try{localStorage.setItem(cartKey(),JSON.stringify({cart:shopCart,fav:shopFav,request:shopRequest}));}catch{}}
const shopItems=()=>db.products.filter(p=>p.active);
function shopPicture(p){return imageTag(p.image||safeImage(p.gallery?.[0]),p.name)||icon('bag','var(--shop-ink,#166047)');}
function shopPrice(p){return '<strong>'+(business.demo_pack&&p.price_minor===0?'N$0-00':money(price(p)))+'</strong>'+(p.sale?'<del>'+money(p.price)+'</del>':'');}
function shopCard(p){
 const badge={...visualSetting('price-default'),...visualSetting('price:'+p.id)};
 return '<article class="shop-card"><div class="shop-card-media"><button class="shop-photo" data-item="'+p.id+'" aria-label="View '+esc(p.name)+'">'+shopPicture(p)+'</button>'
 +'<span class="shop-price-slot"><span class="shop-price-badge" style="'+visualPaint(badge)+'">'+shopPrice(p)+'</span>'+visualDots('price:'+p.id,'price badge')+'</span></div>'
 +'<button class="shop-heart '+(shopFav.includes(p.id)?'liked':'')+'" data-fav="'+p.id+'" aria-label="Favourite '+esc(p.name)+'" aria-pressed="'+shopFav.includes(p.id)+'">'+shopIcon('heart')+'</button>'
 +inlineEditButton('photo',p.id,'Image')+'<div class="shop-card-copy"><button data-item="'+p.id+'">'+esc(p.name)+'</button>'+inlineEditButton('product',p.id,'Edit product')+'</div></article>';
}
function searchBox(){return '<label class="shop-search">'+shopIcon('search')+'<input id="shop-search" type="search" placeholder="Search products" aria-label="Search products" value="'+esc(shopSearch)+'"></label>';}
function filteredItems(){const rows=shopItems().filter(p=>(!shopStock||p.stock!==0)&&(!shopSize||p.sizes?.includes(shopSize))).filter(p=>(!shopFilter||p.category===shopFilter)&&(!shopOnlyFav||shopFav.includes(p.id))&&(!shopOnlySale||p.sale)&&[p.name,p.category,p.description].join(' ').toLowerCase().includes(shopSearch.toLowerCase()));
 return shopSort==='low'?rows.sort((a,b)=>shopUnit(a)-shopUnit(b)):shopSort==='high'?rows.sort((a,b)=>shopUnit(b)-shopUnit(a)):rows;
}
function updateShopGrid(){const grid=document.getElementById('shop-grid');if(grid)grid.innerHTML=filteredItems().map(shopCard).join('')||'<p>No matching products.</p>';}
const collections=()=>[...new Set(shopItems().map(p=>p.category).filter(Boolean))];
function shopNav(){
 const ownerSettings=canEditInlineStore();
 const tabs=[['home','Home'],['shop','Shop'],['catalogue','Catalogue'],['cart','Cart']];
 const settings=ownerSettings?'<a href="/'+encodeURIComponent(business.slug)+'/owner"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" d="M4 6h16M4 12h16M4 18h16"/><path stroke-linecap="round" stroke-width="4" d="M8 6h.01M16 12h.01M10 18h.01"/></svg><span>Settings</span></a>':'';
 return '<nav class="shop-tabs'+(ownerSettings?' shop-tabs-owner':'')+'" aria-label="Store navigation">'
  +tabs.map(([key,label])=>visualButton('nav:'+key,label+(key==='cart'&&shopCart.length?' · '+shopCart.reduce((n,line)=>n+line.quantity,0):''),key,shopIcon(key))).join('')
  +settings+'</nav>';
}
function shopPills(){return '<div class="shop-pills">'+[['','All'],...collections().map(c=>[c,c])].map(([id,label])=>'<button data-collection="'+esc(id)+'" aria-pressed="'+(shopFilter===id&&!shopOnlySale)+'">'+esc(label)+'</button>').join('')+'</div>';}
function renderShop(){
 const homeConfig=currentHomeSettings();
 applyHomeColours(homeConfig);
 const items=shopItems(), profile=publishedContent||{}, merch=isTrendora()?(profile.merchandising||{}):{};
 let body='';
 if(shopPage==='home'){
  const featured=merch.featured?.length?items.filter(p=>merch.featured.includes(p.id)):items.slice(0,4);
  const saleBanner=merch.bannerEnabled===false?'':items.some(p=>p.sale)?'<div class="shop-sale-wrap">'+(safeImage(merch.bannerImage)?imageTag(merch.bannerImage,''):'')
   +(safeImage(merch.bannerLink)?'<a class="shop-sale" href="'+esc(merch.bannerLink)+'">':'<button class="shop-sale" data-shop-sale>')
   +'<strong>'+esc(merch.bannerTitle||(isTrendora()?'Mid-season sale':'Store sale'))+'</strong><span>Browse discounted products →</span>'+(safeImage(merch.bannerLink)?'</a>':'</button>')+'</div>':'';
  body='<section data-home-section="profile" class="shop-profile">'+(imageTag(profile.logo,business.name)||'<div class="shop-avatar">'+esc(business.name.slice(0,1).toUpperCase())+'</div>')
   +'<h1>'+esc(business.name)+'</h1><small>on eNuxes</small><p>'+esc(business.description)+'</p>'
   +'<button id="shop-follow" aria-pressed="'+Boolean(shopInfo.following)+'">'+shopIcon('people')+' '+(shopInfo.following?'Following':'Follow')+(Number.isFinite(Number(shopInfo.followers))?' · '+Number(shopInfo.followers).toLocaleString()+' followers':'')+'</button>'
   +([profile.category,profile.email,profile.phone].some(Boolean)?'<p class="muted">'+[profile.category,profile.email,profile.phone].filter(Boolean).map(esc).join(' · ')+'</p>':'')+inlineEditButton('profile','','Edit profile')+'</section>'
   +'<div data-home-section="slideshow">'+saleBanner+bannerHtml()+inlineEditButton('sections','','Edit slideshow and sections')+'</div>'
   +'<div data-home-section="search">'+searchBox()+'</div><div data-home-section="categories">'+shopPills()+'</div><section data-home-section="featured"><div id="browse" class="row shop-heading">'+visualHeading('heading:featured','Featured')+visualButton('button:shop','See all','shop')+'</div><div class="shop-grid" id="products">'+(featured.map(shopCard).join('')||'<p>No products yet.</p>')+'</div></section>';
 }else if(shopPage==='shop'){
  body='<div class="shop-heading">'+visualHeading('heading:shop','Shop all products')+'<p class="muted">Browse the collection</p></div>'+searchBox()
   +'<div class="shop-filters"><label>Category<select id="shop-category"><option value="">All products</option>'+collections().map(c=>'<option value="'+esc(c)+'" '+(shopFilter===c?'selected':'')+'>'+esc(c)+'</option>').join('')+'</select></label>'
   +'<label>Sort<select id="shop-sort"><option value="">Default</option><option value="low" '+(shopSort==='low'?'selected':'')+'>Price low to high</option><option value="high" '+(shopSort==='high'?'selected':'')+'>Price high to low</option></select></label>'
   +'<button data-shop-filter="fav" aria-pressed="'+shopOnlyFav+'">'+shopIcon('heart')+' Favourites</button><button data-shop-filter="sale" aria-pressed="'+shopOnlySale+'">Sale</button><button data-shop-filter="stock" aria-pressed="'+shopStock+'">In stock</button><button data-shop-filter="clear">Clear filters</button></div>'+shopPills()+'<div class="shop-grid" id="shop-grid"></div>';
 }else{
  const names=collections();
  if(items.some(p=>p.sale))names.push('Sale');
  const configured=Array.isArray(merch.collections)?merch.collections:[];
  const ordered=isTrendora()?[...new Set([...configured.map(c=>c.name),...trendoraCollections,...names])]:names;
  const groups=ordered.filter(name=>names.includes(name)&&configured.find(c=>c.name===name)?.enabled!==false).map(name=>{
    const cover=configured.find(c=>c.name===name)?.cover;
    return [name,safeImage(cover)||(isTrendora()&&trendoraCover[name]?trendoraAsset(trendoraCover[name]):items.find(p=>p.category===name&&p.image)?.image)];
  });
  body='<div class="shop-heading">'+visualHeading('heading:catalogue','Catalogue')+'<p class="muted">Browse our collections</p></div><div class="shop-collections">'
   +(groups.map(([name,cover])=>'<button class="shop-collection" '+(name==='Sale'?'data-shop-sale':'data-collection="'+esc(name)+'"')+'>'+(cover?imageTag(cover):'')+'<strong>'+esc(name)+'</strong><span aria-hidden="true">›</span></button>').join('')||'<p>No collections yet.</p>')+'</div>';
 }
 app.innerHTML='<div class="shop-frame">'+ownerStoreToolbar()+'<div class="shop-content">'+body+'</div>'+shopNav()+'</div>';
 if(canEditInlineStore())app.querySelector('.shop-content').insertAdjacentHTML('afterbegin','<div class="visual-store-price"><span>Price Badge Colour</span>'+visualDots('price-default','store-wide price badge colour')+'</div>');
 if(shopPage==='shop')updateShopGrid();
 if(canEditInlineStore()&&shopPage==='shop')app.querySelector('.shop-heading').insertAdjacentHTML('beforeend',inlineEditButton('product','','Add product'));
 if(shopPage==='home')renderPublishedLayout(homeConfig);
}

function detail(id){
 const p=getProduct(id);if(!p)return;
 if(canEditInlineStore()){
  ownerStore=business;
  modal.className='shop-detail owner-edit-sheet';
  openDialog('Edit product','<div class="inline-store-editor">'+productForm(p,true)+'<button type="button" data-inline-delete="'+p.id+'">Delete item</button></div>');
  return;
 }
 const options=(name,list)=>list?.length?'<fieldset><legend>'+name+'</legend><div class="shop-options">'+list.map((option,i)=>'<label><input type="radio" name="'+name+'" value="'+esc(option)+'" '+(i?'':'checked')+'><span>'+esc(option)+'</span></label>').join('')+'</div></fieldset>':'';
 modal.className='shop-detail';
 openDialog('Details','<div class="shop-detail-photo">'+shopPicture(p)+'</div>'
  +'<form id="shop-item" data-id="'+p.id+'"><div class="row"><h2>'+esc(p.name)+'</h2><button type="button" data-fav="'+p.id+'" aria-label="Favourite" aria-pressed="'+shopFav.includes(p.id)+'">'+shopIcon('heart')+'</button></div><div class="shop-detail-price">'+shopPrice(p)+'</div>'
  +options('Colour',p.colours)+options('Size',p.sizes)
  +'<label>Quantity <div class="shop-step"><button type="button" data-detail-step="-1" aria-label="Decrease quantity">−</button><input name="quantity" type="number" min="1" max="'+Math.min(99,p.stock??99)+'" value="1" aria-label="Quantity" required><button type="button" data-detail-step="1" aria-label="Increase quantity">+</button></div></label>'
  +'<p>'+esc(p.description)+'</p>'+(storefrontPreview?'<p>Ordering is disabled in preview.</p>':p.stock===0?'<p>Out of stock</p>':'<div class="shop-cta"><button value="add">Add to Cart</button><button class="primary" value="buy">Buy Now</button></div>')+'</form>');
}

function showCart(){
 modal.className='shop-sheet';
 const subtotal=orderTotal(shopCart)/100;
 const fee=isTrendora()?shopInfo.delivery_fee:0;
 openDialog('My cart',shopCart.length?'<div class="shop-cart-lines">'+shopCart.map((line,i)=>{const p=getProduct(line.id);return '<article class="shop-cart-line"><div class="shop-thumb">'+shopPicture(p)+'</div><div><strong>'+esc(p.name)+'</strong><small>'+[line.size,line.colour].filter(Boolean).map(esc).join(' · ')+'</small><span>'+money(price(p)*line.quantity)+'</span></div><div class="shop-step"><button data-cart-index="'+i+'" data-cart-step="-1" aria-label="Decrease quantity">−</button><span>'+line.quantity+'</span><button data-cart-index="'+i+'" data-cart-step="1" aria-label="Increase quantity">+</button><button data-cart-index="'+i+'" data-cart-step="0" aria-label="Remove item">×</button></div></article>';}).join('')+'</div>'
 +'<div class="shop-total"><div class="row"><span>Subtotal</span>'+money(subtotal)+'</div><div class="row"><span>'+(isTrendora()?'Delivery fee':'Collection fee')+'</span>'+money((fee||0)/100)+'</div>'
 +(!isTrendora()&&shopInfo.delivery_fee!=null?'<div class="row muted"><span>Delivery estimate (separate)</span>'+money(shopInfo.delivery_fee/100)+'</div>':'')
 +'<div class="row"><strong>Total</strong><strong>'+money(subtotal+(fee||0)/100)+'</strong></div></div>'
 +(shopInfo.collection?'<button class="primary shop-checkout" data-shop-checkout>Checkout</button>':'<p class="notice">Collection checkout is unavailable for this store.</p>'):'<p>Your cart is empty.</p>');
}

async function loadShopInfo(follow){
 const [info]=await request('/rest/v1/rpc/shop_info',{method:'POST',data:{p_business:business.id,p_device:shopDevice,p_follow:follow??null}});
 shopInfo=info||{};
}
async function startShop(){
 document.body.classList.add('customer-shop');
 if(isTrendora())document.body.classList.add('trendora-shop');
 document.querySelector('meta[name="viewport"]').content='width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
 const saved=loadSaved(cartKey(),{});
 shopCart=(Array.isArray(saved.cart)?saved.cart:[]).filter(line=>getProduct(line?.id)&&Number.isInteger(line.quantity)&&line.quantity>0&&line.quantity<=99);
 shopFav=Array.isArray(saved.fav)?saved.fav:[];
 shopRequest=saved.request||crypto.randomUUID();
 shopDevice=loadSaved('enuxes-shop-device',null)||crypto.randomUUID();
 try{localStorage.setItem('enuxes-shop-device',JSON.stringify(shopDevice));}catch{}
 renderShop();
 if(!storefrontPreview)await loadShopInfo().catch(()=>{});
 if(shopPage==='home'&&!modal.open)renderShop();
 startTrendoraRefresh();
}


let trendoraRefreshing=false;
function startTrendoraRefresh(){
 const refresh=()=>refreshTrendora().catch(()=>{});
 setInterval(refresh,8000);
 window.addEventListener('online',refresh);
 window.addEventListener('storage',event=>{
  if(event.key==='enuxes-storefront-saved:'+business.slug)refresh();
 });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
 modal.addEventListener('close',refresh);
}
async function refreshTrendora(){
 if(app.querySelector('.inline-store-editor')||trendoraRefreshing||document.hidden||modal.open||checkoutInFlight||document.activeElement?.matches('input,select,textarea'))return;
 trendoraRefreshing=true;
 try{
  const [snapshot,info]=await Promise.all([readStorefront(business.slug),
    storefrontPreview?Promise.resolve([]):request('/rest/v1/rpc/shop_info',{method:'POST',data:{p_business:business.id,p_device:shopDevice,p_follow:null}})]);
  if(app.querySelector('.inline-store-editor')||modal.open||checkoutInFlight||document.activeElement?.matches('input,select,textarea'))return;
  if(!snapshot){app.innerHTML='<h2>Store unavailable</h2><a href="/">Browse businesses</a>';return;}
  const changed=JSON.stringify(snapshot)!==storefrontVersion;
  const infoChanged=JSON.stringify(info[0]||{})!==JSON.stringify(shopInfo);
  if(!changed&&!infoChanged&&app.querySelector('.shop-frame'))return;
  const before=new Map(db.products.map(p=>[p.id,shopUnit(p)]));
  const previousFee=shopInfo.delivery_fee;
  applyStorefront(snapshot);shopInfo=info[0]||{};
  const remaining=new Map();
  let cartChanged=previousFee!==shopInfo.delivery_fee&&shopCart.length>0;
  shopCart=shopCart.flatMap(line=>{
   const p=getProduct(line.id);
   if(!p||(p.sizes?.length?!p.sizes.includes(line.size):line.size)||(p.colours?.length?!p.colours.includes(line.colour):line.colour)){cartChanged=true;return [];}
   const available=remaining.get(p.id)??maxShopQuantity(p);
   const quantity=Math.min(line.quantity,available);
   remaining.set(p.id,available-quantity);
   if(quantity!==line.quantity||before.get(p.id)!==shopUnit(p))cartChanged=true;
   return quantity?[{...line,quantity}]:[];
  });
  if(cartChanged){saveCartChange();toast('Your cart changed. Review the latest prices and availability.');}
  renderShop();
 }finally{trendoraRefreshing=false;}
}

function changeShop(page){shopPage=page;renderShop();window.scrollTo(0,0);}
function saveCartChange(){shopRequest=crypto.randomUUID();saveShop();}
function maxShopQuantity(p){return Math.min(p.stock??99,99);}
function addShopLine(p,selection,quantity){
 const used=shopCart.filter(line=>line.id===p.id).reduce((sum,line)=>sum+line.quantity,0);
 if(!Number.isInteger(quantity)||quantity<1||used+quantity>maxShopQuantity(p))throw new Error('That quantity is unavailable.');
 const existing=shopCart.find(line=>line.id===p.id&&line.size===selection.size&&line.colour===selection.colour);
 if(existing)existing.quantity+=quantity;
 else{if(shopCart.length>=30)throw new Error('Your cart has reached its item limit.');shopCart.push({id:p.id,...selection,quantity});}
 saveCartChange();
}
document.addEventListener('click',async event=>{
 if(!document.body.classList.contains('customer-shop'))return;
 const button=event.target.closest('button');if(!button)return;
 const d=button.dataset;
 if(d.shopPage){if(d.shopPage==='cart')return storefrontPreview?openDialog('Cart preview','<p>Orders are disabled in this preview.</p>'):showCart();shopSearch=shopFilter='';shopOnlySale=shopOnlyFav=false;return changeShop(d.shopPage);}
 if(d.item)return detail(d.item);
 if(d.fav){
  shopFav=shopFav.includes(d.fav)?shopFav.filter(id=>id!==d.fav):[...shopFav,d.fav];saveShop();
  if(modal.open)button.setAttribute('aria-pressed',shopFav.includes(d.fav));renderShop();return;
 }
 if(d.collection!==undefined||d.shopSale!==undefined){shopFilter=d.collection||'';shopOnlySale=d.shopSale!==undefined;shopOnlyFav=false;shopSearch='';return changeShop('shop');}
 if(d.shopFilter){if(d.shopFilter==='fav')shopOnlyFav=!shopOnlyFav;else if(d.shopFilter==='sale')shopOnlySale=!shopOnlySale;else if(d.shopFilter==='stock')shopStock=!shopStock;else{shopOnlySale=shopOnlyFav=shopStock=false;shopFilter=shopSearch=shopSort=shopSize='';}return renderShop();}
 if(button.id==='shop-follow'){
  if(storefrontPreview)return toast('Following is disabled in preview.');
  button.disabled=true;try{await loadShopInfo(!shopInfo.following);renderShop();}catch{toast('Could not update follow status.');button.disabled=false;}return;
 }
 if(d.detailStep){const input=button.form.elements.quantity;input.value=Math.max(1,Math.min(Number(input.max),Number(input.value)+Number(d.detailStep)));return;}
 if(d.cartIndex!==undefined){
  const index=Number(d.cartIndex),line=shopCart[index],step=Number(d.cartStep);if(!line||checkoutInFlight)return;
  const p=getProduct(line.id),used=shopCart.filter(row=>row.id===p.id).reduce((sum,row)=>sum+row.quantity,0);
  if(step>0&&used>=maxShopQuantity(p))return toast('That quantity is unavailable.');
  if(!step||line.quantity+step<1)shopCart.splice(index,1);else line.quantity+=step;
  saveCartChange();renderShop();return showCart();
 }
 if(d.shopCheckout!==undefined)showCheckout(shopCart,shopRequest);
});
document.addEventListener('input',event=>{
 if(event.target.id!=='shop-search')return;
 shopSearch=event.target.value;
 if(shopPage==='home'){
  const caret=event.target.selectionStart;
  shopPage='shop';renderShop();
  const input=document.getElementById('shop-search');input.focus();
  if(caret!==null)try{input.setSelectionRange(caret,caret);}catch{}
 }else updateShopGrid();
});
document.addEventListener('change',event=>{if(event.target.id==='shop-category'){shopFilter=event.target.value;updateShopGrid();}if(event.target.id==='shop-sort'){shopSort=event.target.value;updateShopGrid();}});
document.addEventListener('submit',async event=>{
 const form=event.target;if(!['shop-item','shop-order'].includes(form.id))return;
 event.preventDefault();if(storefrontPreview)return;const fields=new FormData(form);
 if(form.id==='shop-item'){
  const p=getProduct(form.dataset.id);if(!p)return;
  try{
   const selection={size:fields.get('Size'),colour:fields.get('Colour')},quantity=Number(fields.get('quantity'));
   if(event.submitter?.value==='buy'){
    if(!Number.isInteger(quantity)||quantity<1||quantity>maxShopQuantity(p))throw new Error('That quantity is unavailable.');
    showCheckout([{id:p.id,...selection,quantity}],crypto.randomUUID(),true);
   }else{addShopLine(p,selection,quantity);renderShop();modal.close();toast('Added to cart');}
  }catch(error){toast(error.message);}return;
 }
 if(checkoutInFlight||!instantOrder)return;
 const button=form.querySelector('button');button.disabled=true;checkoutInFlight=true;
 try{
  const order=instantOrder;
  const data={p_request:order.key,p_name:String(fields.get('name')).trim(),p_mobile:String(fields.get('mobile')).trim(),p_lines:order.lines};
  if(isTrendora())Object.assign(data,{p_address:String(fields.get('address')).trim(),p_total:order.total});
  else data.p_business=business.id;
  const id=await request('/rest/v1/rpc/'+(isTrendora()?'trendora_order':'shop_order'),{method:'POST',data});
  if(!order.buyNow){shopCart=[];saveCartChange();}
  instantOrder=null;renderShop();
  openDialog('Order placed','<p>Order <strong>#'+esc(id.slice(0,8).toUpperCase())+'</strong></p><p>'+(isTrendora()?'Demo order saved. No payment was taken.':'Pay when you collect from '+esc(business.name)+'.')+'</p>');
 }catch(error){form.querySelector('[role=status]').textContent=error.message;}
 finally{checkoutInFlight=false;button.disabled=false;}
});
modal.addEventListener('cancel',event=>{if(checkoutInFlight)event.preventDefault();});
modal.addEventListener('click',event=>{if(checkoutInFlight&&event.target.closest('[data-action="close"]'))event.stopPropagation();});
modal.addEventListener('close',()=>{modal.className='';});
