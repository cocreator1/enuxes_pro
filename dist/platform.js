'use strict';
const apiRoot = 'https://ffuqqktvxkbazvzqkfac.supabase.co';
const publicKey = 'sb_publishable_YQU0fJ9kVchMLMW-tjqenQ_gKGXnofM';
const adminPath = '/mainadmin-pro';
const adminEmail = 'enuxespro@enuxes.com';
const storefrontRoot = 'https://www.enuxes.com';
const ownerSlug = location.pathname.match(/^\/([a-z0-9]+(?:-[a-z0-9]+)*)\/owner\/?$/)?.[1];
const storefrontPreview=new URLSearchParams(location.search).get('owner-preview')==='1';
const sessionKey = ownerSlug || storefrontPreview ? 'enuxes-owner-session' : 'enuxes-mainadmin-session';
let adminSession;
let adminStores = [];
let section = 'overview';
let storeQuery = '';
let storeStatus = '';
const sections = {overview:'Overview',marketplace:'Marketplace',stores:'Stores',owners:'Owner access',billing:'Billing',analytics:'Analytics',ads:'Ads',support:'Support',security:'Security',archive:'Archive'};
const businessColumns = 'id,slug,name,type,description,active,demo_pack,owner_published_at';

async function request(endpoint, { method = 'GET', data, token, prefer } = {}) {
  const headers = { apikey: publicKey };
  if (prefer) headers.Prefer = prefer;
  if (token) headers.Authorization = 'Bearer ' + token;
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(apiRoot + endpoint, {
    method, headers, body: data === undefined ? undefined : JSON.stringify(data),
    cache: 'no-store'
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(result?.message || result?.msg || result?.error_description || 'Request failed.');
    error.status = response.status;
    error.code = result?.code;
    throw error;
  }
  return result;
}

function session(value) {
  adminSession = value;
  if (value) sessionStorage.setItem(sessionKey, JSON.stringify(value));
  else sessionStorage.removeItem(sessionKey);
}

async function getSessionToken() {
  if (!adminSession) throw new Error('Sign in to continue.');
  if (adminSession.expires_at <= Date.now() / 1000 + 30) {
    session(await request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', data: { refresh_token: adminSession.refresh_token }
    }));
  }
  return adminSession.access_token;
}

async function adminRequest(name, args = {}) {
  return request('/rest/v1/rpc/' + name, {
    method: 'POST', token: await getSessionToken(), data: args
  });
}

function signIn(message = '') {
  app.innerHTML = '<div class="panel" style="max-width:440px;margin:48px auto"><h2>' + (ownerSlug ? 'Store owner' : 'Main Admin') + '</h2>'
    + (message ? '<p class="notice" role="alert">' + esc(message) + '</p>' : '')
    + '<form id="main-admin-login"><label>' + (ownerSlug ? 'Username or email' : 'Username') + '<input name="email" type="' + 'text' + '" autocomplete="username" required></label>'
    + '<label>Password<input name="password" type="password" autocomplete="current-password" required></label>'
    + '<button class="primary">Sign in</button></form></div>';
}

const labels = {active:'Active',closed:'Closed',on_hold:'On hold',deleted:'Archived'};
function ownerLoginLink(slug) {
  const url = esc(storefrontRoot + '/' + encodeURIComponent(slug) + '/owner');
  return '<div class="toolbar"><a href="' + url + '" style="overflow-wrap:anywhere">Owner login · ' + url + '</a>'
    + '<button data-owner-link="' + url + '">Copy owner login link</button></div>';
}

function storeCard(store) {
  const link = storefrontRoot + '/' + store.slug;
  let buttons = store.lifecycle === 'deleted'
    ? [['closed','Restore as closed']]
    : [['active','Activate'],['closed','Close'],['on_hold','Put on hold'],['deleted','Delete']].filter(([status]) => status !== store.lifecycle);
  if (section === 'billing') buttons = store.lifecycle === 'on_hold'
    ? [['active','Release hold'],['closed','Release as closed']]
    : [['on_hold','Put on hold']];
  if (['owners','analytics','ads','support'].includes(section)) buttons = [];
  return '<article class="panel stack"><div class="row"><div><strong>' + esc(store.name) + '</strong><br>'
    + '<small>' + esc(store.type.replaceAll('_',' ')) + ' · ' + esc(store.package || 'Starter') + '</small></div>'
    + '<span class="badge">' + labels[store.lifecycle] + '</span></div>'
    + (store.lifecycle === 'active' ? '<a href="' + link + '">' + link + ' ↗</a>' : '<small>' + link + '</small>')
    + ownerLoginLink(store.slug)
    + (['stores','owners'].includes(section) && store.lifecycle!=='deleted' ? '<div><button data-owner-password="'+esc(store.id)+'">Update owner password</button></div>' : '')
    + (store.status_reason ? '<small>' + esc(store.status_reason) + '</small>' : '')
    + '<div class="toolbar">' + buttons.map(([status,label]) =>
      '<button data-business-status="' + status + '" data-business-id="' + store.id + '">' + label + '</button>').join('')
    + (section === 'stores' ? '<button data-layout-limit="' + store.id + '">Slideshow limit</button>' : '')
    + (section === 'support' ? '<button data-support="' + store.id + '">Open conversation</button>' : '')
    + (section === 'analytics' ? '<button data-analytics="' + store.id + '">View analytics</button>' : '')
    + (['ads','billing'].includes(section) ? '<button data-ad-settings="' + store.id + '">' + (section === 'billing' ? 'Ad-free billing' : 'Manage banner') + '</button>' : '')
    + '</div></article>';
}

function renderStoreRows() {
  const target = document.getElementById('admin-store-rows');
  if (!target) return;
  const query = storeQuery.trim().toLowerCase();
  const rows = adminStores.filter(store => {
    if (section === 'archive') return store.lifecycle === 'deleted';
    if (store.lifecycle === 'deleted') return false;
    return (!storeStatus || store.lifecycle === storeStatus)
      && (!query || [store.name,store.slug,store.package].some(value => String(value ?? '').toLowerCase().includes(query)));
  });
  target.innerHTML = rows.map(storeCard).join('') || '<div class="panel">No matching stores.</div>';
}

function revealWorkspaceTab() {
  const strip = app.querySelector('.admin-sections');
  const active = strip?.querySelector('.active');
  if (!active || strip.scrollWidth <= strip.clientWidth) return;
  const bounds = strip.getBoundingClientRect();
  const tab = active.getBoundingClientRect();
  strip.scrollLeft += tab.left - bounds.left - (strip.clientWidth - tab.width) / 2;
}

function dashboard() {
  const metrics = Object.entries(labels).map(([status,label]) =>
    '<button class="panel admin-metric" data-metric="' + status + '"><small>' + label + '</small><strong>'
    + adminStores.filter(store => store.lifecycle === status).length + '</strong></button>').join('');
  const distribution = Object.entries(labels).map(([status,label]) => {
    const count = adminStores.filter(store => store.lifecycle === status).length;
    return '<label>' + label + ' · ' + count + '<progress value="' + count + '" max="' + Math.max(1,adminStores.length) + '"></progress></label>';
  }).join('');
  const navItems = Object.entries(sections).map(([id,label]) =>
    '<button data-section="' + id + '" ' + (id === section ? 'class="active" aria-current="page"' : '') + '>' + label + '</button>').join('');
  const details = {
    stores:'Create stores and manage storefront availability.',
    owners:'Share each store’s direct login link. Owners need a Supabase account assigned to that store.',
    billing:'Apply a hold for overdue accounts and release it once payment is confirmed. Payment checks are manual.',
    analytics:'Search for a store to view its recorded order activity and paid revenue.',
    ads:'Manage the sponsored banner that appears above each store catalogue.',
    support:'Find a store and reply to its owner in a private conversation.',
    archive:'Restore deleted stores as closed before reopening them.'
  };
  app.innerHTML = '<div class="admin-layout"><aside class="panel admin-sidebar">' + workspaceBrand + '<small>MAIN ADMIN</small>'
    + '<div class="admin-sections" aria-label="Main Admin sections">' + navItems + '</div></aside><section class="stack">'
    + '<div class="row workspace-top"><div><small>ENUXES ADMINISTRATION</small><h2>' + sections[section] + '</h2></div><div class="toolbar">'
    + '<button class="primary" id="create-business">Create store</button><button id="admin-signout">Sign out</button></div></div>'
    + (section === 'overview'
      ? '<div class="grid">' + metrics + '</div><div class="split"><div class="panel stack"><h2>Store status</h2>' + distribution + '</div><div class="panel stack"><h2>Manage the platform</h2><div class="toolbar">'
        + '<button data-section="stores">Manage stores</button><button data-section="owners">Owner login links</button><button data-section="billing">Review billing holds</button><button data-section="support">Support conversations</button></div></div></div>'
      : section === 'marketplace' ? '<div id="market-admin" class="stack"><p>Loading marketplace…</p></div>'
      : section === 'security' ? '<div class="panel stack"><h2>Change password</h2><p class="muted">Passwords are managed by Supabase Auth.</p><form id="main-admin-password">'
        + '<label>Current password<input name="current" type="password" autocomplete="current-password" required></label>'
        + '<label>New password<input name="password" type="password" minlength="14" autocomplete="new-password" required></label>'
        + '<label>Confirm new password<input name="confirm" type="password" minlength="14" autocomplete="new-password" required></label>'
        + '<div><button class="primary">Update password</button></div><p role="status" id="password-result"></p></form></div>'
      : '<p class="muted">' + details[section] + '</p>'
        + (section === 'archive' ? '' : '<div class="toolbar"><input class="search" id="admin-store-search" type="search" aria-label="Search stores" placeholder="Search name, link or package" value="' + esc(storeQuery) + '">'
          + '<select id="admin-store-status" aria-label="Filter by store status"><option value="">All statuses</option>'
          + Object.entries(labels).filter(([status]) => status !== 'deleted').map(([status,label]) => '<option value="' + status + '" ' + (storeStatus === status ? 'selected' : '') + '>' + label + '</option>').join('') + '</select></div>')
        + '<div class="stack" id="admin-store-rows"></div>')
    + '</section></div>';
  revealWorkspaceTab();
  renderStoreRows();
  const market=app.querySelector('#market-admin');
  if(market)marketplaceAdmin(market).catch(()=>{market.textContent='Marketplace could not load. Reopen the tab to retry.';});
}

function changeSection(next, status = '') {
  if (!Object.hasOwn(sections,next)) return;
  section = next;
  storeQuery = '';
  storeStatus = status;
  dashboard();
}

document.addEventListener('input', event => {
  if (event.target.id === 'admin-store-search') {
    storeQuery = event.target.value;
    renderStoreRows();
  }
});
document.addEventListener('change', event => {
  if (event.target.id === 'admin-store-status') {
    storeStatus = event.target.value;
    renderStoreRows();
  }
});

async function refreshDashboard() {
  if (ownerSlug) {
    const token = await getSessionToken();
    const memberships = await request('/rest/v1/business_members?select=businesses!inner(' + businessColumns + ')&businesses.slug=eq.' + ownerSlug, {token});
    const store = memberships[0]?.businesses;
    if (!store) throw new Error('This account has no access to this store.');
    ownerStore=store;
    ownerDashboard();
    clearInterval(ownerPoll);
    ownerPoll=setInterval(()=>{
      if (!document.hidden && ['Overview','Orders','Inventory','Notifications'].includes(ownerTab)) renderOwnerTab().catch(()=>{});
    },30000);
    return;
  }
  adminStores = await adminRequest('platform_business_list');
  dashboard();
}

function slugFrom(name) {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,50);
}

function addPasswordToggles(container) {
  for(const input of container.querySelectorAll('input[type=password]')){
    input.insertAdjacentHTML('afterend','<button type="button" data-password-visibility>Show password</button>');
  }
}

function showCreate() {
  openDialog('Create store', '<form id="main-admin-create"><label>Internal link suggestion<input name="name" required maxlength="100"></label>'
    + '<label>Link name<input name="slug" required maxlength="50" pattern="[a-z0-9]+(?:-[a-z0-9]+)*"></label>'
    + '<small id="slug-preview">' + storefrontRoot + '/</small>'
    + '<label>Business category<select name="type">'+draftTypes.map(([name],i)=>'<option value="'+i+'">'+name+'</option>').join('')+'</select></label>'
    + '<label>Approved artwork<select name="pack"></select></label><details class="create-pack-preview"><summary>Preview demo artwork</summary><div id="draft-pack-preview"></div></details>'
    + '<label>Package<select name="package"><option>Starter</option><option>Silver</option><option>Gold</option></select></label>'
    + '<label>Owner name<input name="ownerName" required maxlength="100"></label>'
    + '<label>Owner username<input name="username" required minlength="3" maxlength="32" pattern="[a-z0-9][a-z0-9_\\-]{2,31}" autocomplete="off"></label>'
    + '<label>Initial owner password<input name="ownerPassword" type="password" required minlength="14" maxlength="72" autocomplete="new-password"></label>'
    + '<p class="muted">Created privately as Store Name. The assigned owner can publish once ready.</p>'
    + '<p id="admin-form-error" role="alert" hidden></p><button class="primary">Create store</button></form>');
  const form = document.getElementById('main-admin-create');
  addPasswordToggles(form);
  bindDraftPack(form);
  let customised = false;
  form.addEventListener('input', event => {
    if (event.target.name === 'slug') customised = Boolean(form.elements.slug.value);
    if (!customised) form.elements.slug.value = slugFrom(form.elements.name.value);
    document.getElementById('slug-preview').textContent = storefrontRoot + '/' + form.elements.slug.value;
  });
}

document.addEventListener('click', async event => {
  if (!ownerSlug && location.pathname.replace(/\/$/,'') !== adminPath) return;
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.action==='close') supportLoad++;
  if (target.hasAttribute('data-owner-storefront') && ownerStore) {
    location.assign('/'+encodeURIComponent(ownerStore.slug)+'?owner-preview=1');
    return;
  }
  if (target.dataset.ownerTab && ownerStore) { ownerTab=target.dataset.ownerTab; return ownerDashboard(); }
  if (target.dataset.layoutLimit) return openLayoutLimit(target.dataset.layoutLimit);
  if (target.dataset.support) return openSupport(target.dataset.support);
  if (target.dataset.section) return changeSection(target.dataset.section);
  if (target.dataset.metric) {
    const status = target.dataset.metric;
    return changeSection(status === 'deleted' ? 'archive' : 'stores',status);
  }
  if (target.dataset.analytics) {
    const store = adminStores.find(item => item.id === target.dataset.analytics);
    if (!store) return;
    openDialog('Analytics · ' + store.name,'<p>Loading…</p>');
    try {
      const [stats] = await adminRequest('platform_store_analytics',{p_business:store.id});
      if (!modal.open) return;
      openDialog('Analytics · ' + store.name, '<p class="muted">All recorded orders</p><div class="split">'
        + [['Orders',stats.order_count],['Paid orders',stats.paid_orders],['Paid revenue',money(Number(stats.paid_minor)/100)],['Cancelled',stats.cancelled_orders]]
          .map(([label,value])=>'<div class="panel"><small>'+label+'</small><h2>'+esc(value)+'</h2></div>').join('') + '</div>');
    } catch { if (modal.open) openDialog('Analytics','<p>Analytics could not be loaded.</p>'); }
    return;
  }
  if (target.dataset.adSettings) {
    const store = adminStores.find(item => item.id === target.dataset.adSettings);
    if (!store) return;
    openDialog('Advertising · ' + store.name,'<p>Loading…</p>');
    try {
      const rows = await request('/rest/v1/store_ad_settings?select=*&business_id=eq.' + store.id,{token:await getSessionToken()});
      if (!modal.open) return;
      const ad = rows[0] || {};
      openDialog('Advertising · ' + store.name, '<form id="main-admin-ad" data-id="' + store.id + '">'
        + '<label>Banner title<input name="title" maxlength="120" value="' + esc(ad.title) + '"></label>'
        + '<label>Banner image URL<input name="image_url" type="url" placeholder="https://" value="' + esc(ad.image_url) + '"></label>'
        + '<label>Destination URL<input name="destination_url" type="url" placeholder="https://" value="' + esc(ad.destination_url) + '"></label>'
        + '<label><span><input name="enabled" type="checkbox" ' + (ad.enabled ? 'checked' : '') + '> Show this banner</span></label>'
        + '<label>Ad-free fee (N$)<input name="fee" type="number" min="0" max="21474836.47" step=".01" value="' + ((ad.ad_free_fee_minor || 0)/100) + '" required></label>'
        + '<label>Ad-free through<input name="until" type="date" value="' + esc(ad.ad_free_until) + '"></label>'
        + '<small>Set the date after confirming payment. The banner stays hidden through that date, Namibia time.</small>'
        + '<p id="admin-form-error" role="alert" hidden></p><button class="primary">Save advertising settings</button></form>');
    } catch { if (modal.open) openDialog('Advertising','<p>Advertising settings could not be loaded.</p>'); }
    return;
  }
  if (target.hasAttribute('data-password-visibility')) {
    const input=target.previousElementSibling;
    const show=input.type==='password';
    input.type=show?'text':'password';
    target.textContent=show?'Hide password':'Show password';
    return;
  }
  if (target.dataset.ownerPassword && !ownerSlug) {
    const store=adminStores.find(item=>item.id===target.dataset.ownerPassword);
    if(!store)return;
    openDialog('Update owner password · '+store.name,
      '<form id="main-admin-owner-password" data-id="'+esc(store.id)+'">'
      +'<label>New owner password<input name="password" type="password" minlength="14" maxlength="72" autocomplete="new-password" required></label>'
      +'<label>Confirm password<input name="confirm" type="password" minlength="14" maxlength="72" autocomplete="new-password" required></label>'
      +'<p id="admin-form-error" role="alert" hidden></p><button class="primary" type="submit">Update password</button></form>');
    addPasswordToggles(modal);
    return;
  }
  if (target.dataset.ownerLink) {
    const link = target.dataset.ownerLink;
    try {
      await navigator.clipboard.writeText(link);
      toast('Owner login link copied.');
    } catch {
      openDialog('Owner login link','<label>Copy this link<input readonly value="' + esc(link) + '"></label>');
    }
    return;
  }
  if (target.id === 'create-business') showCreate();
  if (target.id === 'admin-signout') {
    const token = adminSession?.access_token;
    clearInterval(ownerPoll);
    ownerStore=undefined;
    session(null);
    signIn();
    if (token) await request('/auth/v1/logout?scope=local', {method:'POST',token}).catch(()=>{});
  }
  const store = adminStores.find(item => item.id === target.dataset.businessId);
  const status = target.dataset.businessStatus;
  if (!store || !status) return;
  const title = target.textContent.trim();
  openDialog(title + ' · ' + store.name,
    '<form id="main-admin-status" data-id="' + store.id + '" data-status="' + status + '">'
    + (status === 'deleted' ? '<p>This removes the storefront from view and archives the store. Its order history and link name are retained.</p>' : '')
    + '<label>Internal note (optional)<input name="reason" maxlength="300" placeholder="e.g. Monthly account overdue"></label>'
    + '<p id="admin-form-error" role="alert" hidden></p><button class="primary">' + esc(title) + '</button></form>');
});

document.addEventListener('submit', async event => {
  const form = event.target;
  if (!['main-admin-login','main-admin-create','main-admin-status','main-admin-ad','main-admin-password','main-admin-owner-password'].includes(form.id)) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  const button = form.querySelector('button[type=submit], button:not([type])');
  button.disabled = true;
  try {
    if (form.id === 'main-admin-login') {
      session(await request('/auth/v1/token?grant_type=password', {
        method:'POST', data:{email:ownerSlug ? (values.email.includes('@') ? values.email.trim() : values.email.trim().toLowerCase()+'@owners.enuxes.com') : (values.email.trim().toLowerCase() === 'enuxespro' ? adminEmail : values.email.trim()),password:values.password}
      }));
    } else if (form.id === 'main-admin-password') {
      const status = document.getElementById('password-result');
      try {
        if (values.password !== values.confirm) throw new Error('The new passwords do not match.');
        await getSessionToken();
        const reauth = await request('/auth/v1/token?grant_type=password', {
          method:'POST', data:{email:adminSession.user.email,password:values.current}
        });
        session(reauth);
        await request('/auth/v1/user',{method:'PUT',token:reauth.access_token,data:{password:values.password}});
        form.reset();
        status.textContent = 'Password updated.';
      } catch (error) { status.textContent = error.message; }
      return;
    } else if (form.id === 'main-admin-ad') {
      if (values.enabled && !values.image_url) throw new Error('Add an image URL before enabling the banner.');
      await request('/rest/v1/store_ad_settings?on_conflict=business_id',{
        method:'POST', token:await getSessionToken(), prefer:'resolution=merge-duplicates',
        data:{business_id:form.dataset.id,title:values.title,image_url:values.image_url,destination_url:values.destination_url,
          enabled:Boolean(values.enabled),ad_free_fee_minor:Math.round(Number(values.fee)*100),ad_free_until:values.until || null}
      });
      modal.close();
      toast('Advertising settings saved.');
      return;
    } else if (form.id === 'main-admin-owner-password') {
      if(values.password!==values.confirm)throw new Error('The passwords do not match.');
      await request('/functions/v1/provision-store',{method:'POST',token:await getSessionToken(),data:{
        action:'update-owner-password',storeId:form.dataset.id,password:values.password
      }});
      form.reset();
      modal.close();
      toast('Owner password updated.');
      return;
    } else if (form.id === 'main-admin-create') {
      await request('/functions/v1/provision-store',{method:'POST',token:await getSessionToken(),data:{
        slug:values.slug,type:draftTypes[Number(values.type)][1],plan:values.package,pack:values.pack,
        ownerName:values.ownerName,username:values.username,password:values.ownerPassword
      }});
      section = 'stores';
      storeQuery = storeStatus = '';
      openDialog('Store created', '<p>Share this link with the assigned owner so they can sign in and start editing.</p>' + ownerLoginLink(values.slug));
      try { await refreshDashboard(); } catch { toast('Refresh to reload the store list.'); }
      return;
    } else {
      await adminRequest('platform_set_business_status', {
        p_id:form.dataset.id, p_status:form.dataset.status, p_reason:values.reason
      });
      modal.close();
    }
    await refreshDashboard();
    if(form.id==='main-admin-login' && ownerSlug){
      location.replace('/'+encodeURIComponent(ownerSlug)+'?owner-preview=1');
    }
  } catch (error) {
    if (form.id === 'main-admin-login' || error.status === 401 || error.status === 403) {
      session(null);
      if (modal.open) modal.close();
      signIn(error.message);
    } else if (modal.open) {
      const message = document.getElementById('admin-form-error');
      message.textContent = error.code === '23505' ? 'That link name is taken. Choose another.' : error.message;
      message.hidden = false;
    } else toast('Refresh to reload the store list.');
  } finally { button.disabled = false; }
});

let ownerStore;
let ownerTab = 'Profile';
const ownerProfileTabs = ['Business profile','Store settings','Account','Support'];
let ownerPoll;
let supportLoad = 0;
const workspaceBrand = '<a class="workspace-brand" href="/"><img src="/enuxes-lockup.svg" alt="eNuxes"></a>';

function ownerSettingsNav(slug){
  const editor='/'+encodeURIComponent(slug)+'?owner-preview=1';
  const tabs=[['home','Home'],['shop','Shop'],['catalogue','Catalogue'],['cart','Cart']];
  return '<nav class="shop-tabs shop-tabs-owner owner-settings-nav" aria-label="Store navigation">'
    +tabs.map(([key,label])=>'<a href="'+editor+'&amp;tab='+key+'">'+shopIcon(key)+'<span>'+label+'</span></a>').join('')
    +'<a href="/'+encodeURIComponent(slug)+'/owner" aria-current="page"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/></svg><span>Settings</span></a></nav>';
}

function ownerDashboard() {
  const store = ownerStore;
  const tabs = ['My Store','Orders','Inventory','Products','Store builder','Home Layout',...(store.slug==='trendora'?['Merchandising','Delivery']:[]),'Profile',...(!store.active&&!store.owner_published_at?['Ready to Publish']:[])];
  const selected = ownerProfileTabs.includes(ownerTab) ? 'Profile' : ownerTab;
  app.innerHTML = '<div class="admin-layout owner-dashboard"><aside class="panel admin-sidebar">' + '<label class="workspace-brand owner-brand"><img src="/enuxes-lockup.svg" alt=""><span>Upload logo</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label="Upload store logo"></label><small class="owner-brand-status" role="status"></small><small>STORE OWNER</small>'
    + '<nav class="admin-sections" aria-label="Store tools">' + tabs.map(tab => '<button ' + (tab==='My Store'?'data-owner-storefront':'data-owner-tab="'+tab+'"') + (tab===selected?' class="active" aria-current="page"':'') + '>' + tab + '</button>').join('') + '</nav></aside>'
    + '<section class="stack"><header class="row workspace-top"><div><small>' + esc(store.name) + '</small><h2>' + ownerTab + '</h2></div><div class="toolbar"><button data-owner-tab="Notifications">Notifications <span id="owner-alert-count"></span></button><button id="admin-signout">Sign out</button></div></header><div id="owner-content" class="stack"></div></section></div>' + ownerSettingsNav(store.slug);
  const logoPicker=app.querySelector('.owner-brand input');
  const logoImage=app.querySelector('.owner-brand img');
  const logoStatus=app.querySelector('.owner-brand-status');
  logoPicker.disabled=true;
  getSessionToken().then(token=>contentFor(store.id,token)).then(content=>{
    if(logoImage.isConnected&&safeImage(content.logo))logoImage.src=content.logo;
  }).catch(()=>{}).finally(()=>{logoPicker.disabled=false;});
  logoPicker.onchange=async()=>{
    if(!logoPicker.files.length)return;
    logoPicker.disabled=true;
    logoStatus.textContent='Uploading…';
    try{
      const [logo]=await uploadMedia(logoPicker.files);
      if(!logo)throw new Error('Choose a non-empty image.');
      await updateContent(store.id,{logo},await getSessionToken());
      const currentLogo=app.querySelector('.owner-brand img');
      if(currentLogo&&ownerStore?.id===store.id)currentLogo.src=logo;
      signalStorefrontSave(store.slug);
      logoStatus.textContent='Logo saved';
    }catch(error){
      logoStatus.textContent=error.message;
    }finally{
      logoPicker.value='';
      logoPicker.disabled=false;
    }
  };
  renderOwnerTab().catch(showOwnerError);
}

function showOwnerError() {
  const target = document.getElementById('owner-content');
  if (target) target.innerHTML = '<div class="panel">Could not load this section. Select its tab to retry.</div>';
}

async function renderOwnerTab() {
  const store = ownerStore;
  const tab = ownerTab;
  const target = document.getElementById('owner-content');
  const token = await getSessionToken();
  const byStore = '&business_id=eq.' + store.id;
  if(store.slug==='trendora'){
    if(tab==='Merchandising')return trendoraMerchEditor(target,token);
    if(tab==='Delivery')return trendoraDeliveryEditor(target,token);
    if(tab==='Orders'){
      const rows=await request('/rest/v1/orders?select=id,status,total_minor,customer_name,mobile,address,order_items(product_name,size,colour,quantity)&order=created_at.desc&limit=30'+byStore,{token});
      if(target.isConnected&&!target.querySelector('form'))renderTrendoraOrders(target,rows);
      return;
    }
  }
  if(tab==='Home Layout')return ownerHomeLayout(target,token);
  if(tab==='Ready to Publish')return renderDraftChecklist(target,token);
  if (tab==='Profile'||ownerProfileTabs.includes(tab)) {
    target.innerHTML='<nav class="owner-profile-tabs" aria-label="Profile sections">'
      +ownerProfileTabs.map(label=>'<button data-owner-tab="'+label+'" '+(tab===label?'aria-current="page"':'')+'>'+label+'</button>').join('')+'</nav>';
    if(tab==='Profile'){
      target.insertAdjacentHTML('beforeend','<p>Manage your store identity, appearance, password and support.</p>');
      return;
    }
    const settingsTarget=document.createElement('div');
    target.append(settingsTarget);
    if (['Account','Business profile'].includes(tab)) return ownerEditor(tab,settingsTarget,token);
    if (tab==='Support') {
      settingsTarget.innerHTML='<div class="panel"><h2>Support</h2><p>Chat with the eNuxes team about this store.</p><button data-support="'+store.id+'">Open conversation</button></div>';
      return;
    }
    const [theme]=await request('/rest/v1/store_themes?select=accent'+byStore,{token});
    settingsTarget.innerHTML='<div class="panel"><h2>Store appearance</h2><form id="owner-theme"><label>Store accent<input name="accent" type="color" value="'+esc(theme?.accent||'#166047')+'"></label><div><button class="primary">Save colour</button></div><p role="status"></p></form></div>';
    return;
  }
  if (['Products','Store builder'].includes(tab)) return ownerEditor(tab,target,token);
  const [orders,stock] = await Promise.all([
    request('/rest/v1/orders?select=id,status,payment_status,total_minor,created_at&order=created_at.desc&limit=30'+byStore,{token}),
    request('/rest/v1/products?select=name,stock&active=eq.true&stock=lte.5&order=stock.asc&limit=30'+byStore,{token})
  ]);
  if (document.getElementById('owner-content') !== target) return;
  const alerts = [...orders.flatMap(o => {
    const order = '#' + o.id.slice(0,8).toUpperCase();
    return [o.status==='NEW' && 'New order ' + order, o.payment_status==='PAID' && 'Payment recorded for ' + order,
      ['PENDING','CONFIRMED','PROCESSING'].includes(o.status) && 'Pending fulfilment for ' + order,
      o.payment_status==='PENDING' && 'Payment pending for ' + order].filter(Boolean);
  }), ...stock.map(p => p.stock===0 ? p.name+' is out of stock' : p.name+' has '+p.stock+' left')];
  document.getElementById('owner-alert-count').textContent = '(' + alerts.length + ')';
  const list = (items,empty) => '<div class="panel">' + (items.map(item => '<p class="line">'+esc(item)+'</p>').join('') || '<p>'+empty+'</p>') + '</div>';
  if (tab==='Orders') target.innerHTML = list(orders.map(o=> '#'+o.id.slice(0,8).toUpperCase()+' · '+o.status+' · '+o.payment_status+' · '+money(o.total_minor/100)),'No recorded orders.');
  else if (tab==='Inventory') target.innerHTML = list(stock.map(p=>p.name+' · '+p.stock+' remaining'),'No active products have five or fewer units.');
  else if (tab==='Notifications') target.innerHTML = list(alerts,'No alerts right now.');
  else target.innerHTML = '<div class="grid">' + [['Recent orders',orders.length],['Low-stock products',stock.length],['Alerts',alerts.length]].map(([label,count])=>'<div class="panel admin-metric"><small>'+label+'</small><strong>'+count+'</strong></div>').join('')+'</div><div class="panel"><h2>Storefront</h2>'+(store.active?'<a href="/'+store.slug+'">View storefront ↗</a>':'<p>Unavailable to customers. Contact eNuxes support for help.</p>')+'</div>';
}

async function openSupport(id) {
  const store = ownerSlug ? ownerStore : adminStores.find(item => item.id===id);
  if (!store || store.id!==id) return;
  const generation = ++supportLoad;
  const title = 'Support · ' + store.name;
  openDialog(title,'<p>Loading conversation…</p>');
  try {
    const messages = await request('/rest/v1/store_support_messages?select=sender_role,body,created_at&business_id=eq.'+id+'&order=created_at.desc,id.desc&limit=50',{token:await getSessionToken()});
    if (generation!==supportLoad || !modal.open) return;
    openDialog(title,'<div class="support-log" aria-label="Recent messages">' + (messages.reverse().map(message =>
      '<article class="support-message"><small>'+ (message.sender_role==='platform'?'eNuxes support':'Store owner') + ' · ' + esc(new Date(message.created_at).toLocaleString('en-NA',{timeZone:'Africa/Windhoek'})) + '</small><p>'+esc(message.body)+'</p></article>').join('') || '<p>No messages yet.</p>')
      + '</div><form id="support-message" data-id="'+id+'"><label>Message<textarea name="body" required maxlength="2000" rows="3"></textarea></label><div class="row"><button class="primary">Send</button><button type="button" data-support="'+id+'">Refresh conversation</button></div><p id="support-result" role="status"></p></form>');
    const log=modal.querySelector('.support-log');log.scrollTop=log.scrollHeight;
  } catch { if (generation===supportLoad && modal.open) openDialog(title,'<p>Could not load the conversation.</p>'); }
}

document.addEventListener('submit', async event => {
  const form=event.target;
  if (!['support-message','owner-theme'].includes(form.id)) return;
  event.preventDefault();
  const button=form.querySelector('button');
  button.disabled=true;
  const fields=new FormData(form);
  try {
    const token=await getSessionToken();
    if (form.id==='support-message') {
      const body=fields.get('body').trim();
      if (!body) throw new Error('Enter a message first.');
      await request('/rest/v1/store_support_messages',{method:'POST',token,data:{business_id:form.dataset.id,sender_role:ownerSlug?'owner':'platform',body}});
      if (modal.open && modal.contains(form)) await openSupport(form.dataset.id);
    } else {
      await request('/rest/v1/store_themes?on_conflict=business_id',{method:'POST',token,prefer:'resolution=merge-duplicates',data:{business_id:ownerStore.id,accent:fields.get('accent')}});
      const status=form.querySelector('[role=status]');
      status.textContent='Store colour saved.';
    }
  } catch (error) { form.querySelector('[role=status]').textContent=error.message; }
  finally { button.disabled=false; }
});

function applyStoreTheme(accent) {
  document.body.classList.add('shop-surface');
  if (!/^#[a-f0-9]{6}$/i.test(accent || '')) return;
  document.body.style.setProperty('--shop-tint','color-mix(in srgb, '+accent+' 16%, white)');
  const rgb=accent.slice(1).match(/../g).map(n=>parseInt(n,16));
  const luminance=rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  document.body.style.setProperty('--shop-ink',luminance<=.183?accent:'color-mix(in srgb, '+accent+' 44%, black)');
}

async function readStorefront(slug){
  let store,token;
  if(storefrontPreview){
    token=await getSessionToken();
    const memberships=await request('/rest/v1/business_members?select=businesses!inner('+businessColumns+')&businesses.slug=eq.'+slug,{token});
    store=memberships[0]?.businesses;
  }else [store]=await request('/rest/v1/businesses?select='+businessColumns+'&active=eq.true&slug=eq.'+slug);
  if(!store)return null;
  const filter='&business_id=eq.'+store.id;
  const [products,ads,themes,content]=await Promise.all([
    request('/rest/v1/products?select=id,business_id,name,category,description,image_url,price_minor,sale_price_minor,gallery,sizes,colours,stock,active&active=eq.true&order=id'+filter,{token}),
    request('/rest/v1/store_ad_settings?select=title,image_url,destination_url'+filter),
    request('/rest/v1/store_themes?select=accent'+filter,{token}),
    contentFor(store.id,token)
  ]);
  return {store,products,ad:ads[0]||null,accent:themes[0]?.accent,content};
}

let storefrontVersion;
function applyStorefront(snapshot){
  business=snapshot.store;
  db.products=snapshot.products.map(p=>({...p,businessId:p.business_id,price:p.price_minor/100,sale:p.sale_price_minor/100,image:safeImage(p.image_url)}));
  storeBanner=snapshot.ad;
  publishedContent=snapshot.content;
  applyStoreTheme(snapshot.accent);
  if(isTrendora()){
    const palette=publishedContent.merchandising?.palette||{};
    for(const [key,fallback] of Object.entries(trendoraColours)){
      const value=/^#[a-f0-9]{6}$/i.test(palette[key])?palette[key]:fallback;
      document.body.style.setProperty('--trendora-'+key,value);
    }
    document.body.style.setProperty('--shop-ink',/^#[a-f0-9]{6}$/i.test(palette.primary)?palette.primary:(snapshot.accent||trendoraColours.primary));
    document.body.style.setProperty('--shop-tint',/^#[a-f0-9]{6}$/i.test(palette.sage)?palette.sage:trendoraColours.sage);
  }
  storefrontVersion=JSON.stringify(snapshot);
}

async function boot() {
  nav.innerHTML = '<a class="brand" href="/"><img src="/enuxes-logo.svg" width="34" height="34" alt="">eNuxes</a><a href="/">Businesses</a>';
  document.querySelector('footer').textContent = 'Powered by eNuxes - 2026';
  if (ownerSlug || location.pathname.replace(/\/$/,'') === adminPath) {
    document.body.classList.add('workspace');
    app.innerHTML = '<p>Loading sign-in…</p>';
    try {
      adminSession = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
      if (adminSession) await refreshDashboard();
      else signIn();
    } catch (error) { session(null); signIn(error.message); }
    return;
  }
  applyStoreTheme();
  app.innerHTML = '<p>Loading…</p>';
  const parts = location.pathname.split('/').filter(Boolean);
  try {
    if (!parts.length) { await marketplace(); return; }
    if (parts.length !== 1 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parts[0])) {
      app.innerHTML = '<h2>Page unavailable</h2><a href="/">Browse businesses</a>';
      return;
    }
    if(storefrontPreview){
      adminSession=JSON.parse(sessionStorage.getItem(sessionKey)||'null');
      if(!adminSession){app.innerHTML='<p>Sign in through the owner dashboard to preview this store.</p>';return;}
    }
    const snapshot=await readStorefront(parts[0]);
    if(!snapshot){app.innerHTML='<h2>Store unavailable</h2><a href="/">Browse businesses</a>';return;}
    applyStorefront(snapshot);
    const requestedTab=storefrontPreview?new URLSearchParams(location.search).get('tab'):null;
    if(['shop','catalogue'].includes(requestedTab))shopPage=requestedTab;
    await startShop();
    if(requestedTab==='cart')app.querySelector('[data-shop-page="cart"]')?.click();
  } catch { app.innerHTML = '<h2>Temporarily unavailable</h2><p>Refresh the page to try again.</p>'; }
}

boot();
