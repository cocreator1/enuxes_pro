'use strict';
const apiRoot = 'https://ffuqqktvxkbazvzqkfac.supabase.co';
const publicKey = 'sb_publishable_YQU0fJ9kVchMLMW-tjqenQ_gKGXnofM';
const adminPath = '/mainadmin-pro';
const storefrontRoot = 'https://www.enuxes.com';
const sessionKey = 'enuxes-mainadmin-session';
let adminSession;
let adminStores = [];
const businessColumns = 'id,slug,name,type,description,active';

async function request(endpoint, { method = 'GET', data, token } = {}) {
  const headers = { apikey: publicKey };
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

async function adminRequest(name, args = {}) {
  if (!adminSession) throw new Error('Sign in to continue.');
  if (adminSession.expires_at <= Date.now() / 1000 + 30) {
    session(await request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', data: { refresh_token: adminSession.refresh_token }
    }));
  }
  return request('/rest/v1/rpc/' + name, {
    method: 'POST', token: adminSession.access_token, data: args
  });
}

function signIn(message = '') {
  app.innerHTML = '<div class="panel" style="max-width:440px;margin:48px auto"><h2>Main Admin</h2>'
    + (message ? '<p class="notice" role="alert">' + esc(message) + '</p>' : '')
    + '<form id="main-admin-login"><label>Email<input name="email" type="email" autocomplete="username" required></label>'
    + '<label>Password<input name="password" type="password" autocomplete="current-password" required></label>'
    + '<button class="primary">Sign in</button></form></div>';
}

const labels = {active:'Active',closed:'Closed',on_hold:'On hold',deleted:'Archived'};
function dashboard() {
  const rows = adminStores.map(store => {
    const link = storefrontRoot + '/' + store.slug;
    const buttons = store.lifecycle === 'deleted'
      ? [['closed','Restore as closed']]
      : [['active','Activate'],['closed','Close'],['on_hold','Put on hold'],['deleted','Delete']].filter(([status]) => status !== store.lifecycle);
    return '<article class="panel stack"><div class="row"><div><strong>' + esc(store.name) + '</strong><br>'
      + '<small>' + esc(store.type.replaceAll('_',' ')) + ' · ' + esc(store.package || 'Starter') + '</small></div>'
      + '<span class="badge">' + labels[store.lifecycle] + '</span></div>'
      + (store.lifecycle === 'active' ? '<a href="' + link + '">' + link + ' ↗</a>' : '<small>' + link + '</small>')
      + (store.status_reason ? '<small>' + esc(store.status_reason) + '</small>' : '')
      + '<div class="toolbar">' + buttons.map(([status,label]) =>
        '<button data-business-status="' + status + '" data-business-id="' + store.id + '">' + label + '</button>').join('') + '</div></article>';
  }).join('');
  app.innerHTML = '<div class="stack"><div class="row"><h2>Main Admin · Stores</h2><div class="toolbar">'
    + '<button class="primary" id="create-business">Create store</button><button id="admin-signout">Sign out</button></div></div>'
    + (rows || '<div class="panel">No stores yet. Select Create store to add one.</div>') + '</div>';
}

async function refreshDashboard() {
  adminStores = await adminRequest('platform_business_list');
  dashboard();
}

function slugFrom(name) {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,50);
}

function showCreate() {
  openDialog('Create store', '<form id="main-admin-create"><label>Store name<input name="name" required maxlength="100"></label>'
    + '<label>Link name<input name="slug" required maxlength="50" pattern="[a-z0-9]+(?:-[a-z0-9]+)*"></label>'
    + '<small id="slug-preview">' + storefrontRoot + '/</small>'
    + '<label>Business type<select name="type">' + ['ONLINE_STORE', ...types.filter(t=>t!=='ONLINE_STORE')].map(t=>'<option value="'+t+'">'+t.replaceAll('_',' ')+'</option>').join('') + '</select></label>'
    + '<label>Package<select name="package"><option>Starter</option><option>Silver</option><option>Gold</option></select></label>'
    + '<label>Description<input name="description" maxlength="300"></label>'
    + '<label><span><input type="checkbox" name="active"> Activate immediately</span></label>'
    + '<p id="admin-form-error" role="alert" hidden></p><button class="primary">Create store</button></form>');
  const form = document.getElementById('main-admin-create');
  let customised = false;
  form.addEventListener('input', event => {
    if (event.target.name === 'slug') customised = Boolean(form.elements.slug.value);
    if (!customised) form.elements.slug.value = slugFrom(form.elements.name.value);
    document.getElementById('slug-preview').textContent = storefrontRoot + '/' + form.elements.slug.value;
  });
}

document.addEventListener('click', async event => {
  if (location.pathname.replace(/\/$/,'') !== adminPath) return;
  const target = event.target.closest('button');
  if (!target) return;
  if (target.id === 'create-business') showCreate();
  if (target.id === 'admin-signout') {
    const token = adminSession?.access_token;
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
  if (!['main-admin-login','main-admin-create','main-admin-status'].includes(form.id)) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  const button = form.querySelector('button[type=submit], button:not([type])');
  button.disabled = true;
  try {
    if (form.id === 'main-admin-login') {
      session(await request('/auth/v1/token?grant_type=password', {
        method:'POST', data:{email:values.email.trim(),password:values.password}
      }));
    } else if (form.id === 'main-admin-create') {
      await adminRequest('platform_create_business', {
        p_slug:values.slug, p_name:values.name, p_type:values.type,
        p_package:values.package, p_description:values.description.trim(), p_active:Boolean(values.active)
      });
      modal.close();
    } else {
      await adminRequest('platform_set_business_status', {
        p_id:form.dataset.id, p_status:form.dataset.status, p_reason:values.reason
      });
      modal.close();
    }
    await refreshDashboard();
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

async function boot() {
  nav.innerHTML = '<a class="brand" href="/"><span>e</span>Nuxes</a><a href="/">Businesses</a>';
  document.querySelector('footer').textContent = 'eNuxes · Commerce & hospitality';
  if (location.pathname.replace(/\/$/,'') === adminPath) {
    app.innerHTML = '<p>Loading Main Admin…</p>';
    try {
      adminSession = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
      if (adminSession) await refreshDashboard();
      else signIn();
    } catch (error) { session(null); signIn(error.message); }
    return;
  }
  app.innerHTML = '<p>Loading…</p>';
  const parts = location.pathname.split('/').filter(Boolean);
  try {
    if (!parts.length) {
      const stores = await request('/rest/v1/businesses?select=' + businessColumns + '&active=eq.true&order=name');
      app.innerHTML = '<div class="hero"><section><span class="badge">BUSINESS DIRECTORY</span><h1>Shop local.</h1><p>Discover stores, restaurants and more on eNuxes.</p></section><div class="hero-art">' + icon('bag','#bdd0ff') + '</div></div><h2>Explore businesses</h2><div class="grid">'
        + (stores.map(store => '<article class="panel"><small>' + esc(store.type.replaceAll('_',' ')) + '</small><h3>' + esc(store.name) + '</h3><p>' + esc(store.description) + '</p><a class="button" href="/' + store.slug + '">Visit business ↗</a></article>').join('') || '<p>No stores are open yet.</p>') + '</div>';
      return;
    }
    if (parts.length !== 1 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parts[0])) {
      app.innerHTML = '<h2>Page unavailable</h2><a href="/">Browse businesses</a>';
      return;
    }
    const stores = await request('/rest/v1/businesses?select=' + businessColumns + '&active=eq.true&slug=eq.' + parts[0]);
    if (!stores.length) {
      app.innerHTML = '<h2>Store unavailable</h2><a href="/">Browse businesses</a>';
      return;
    }
    business = stores[0];
    const products = await request('/rest/v1/products?select=id,business_id,name,category,description,image_url,price_minor,sale_price_minor,active&active=eq.true&business_id=eq.' + business.id);
    db.products = products.map(p => ({
      ...p, businessId:p.business_id, price:p.price_minor/100, sale:p.sale_price_minor/100,
      image:/^https:\/\//i.test(p.image_url || '') ? p.image_url : ''
    }));
    storefront();
  } catch { app.innerHTML = '<h2>Temporarily unavailable</h2><p>Refresh the page to try again.</p>'; }
}

boot();
