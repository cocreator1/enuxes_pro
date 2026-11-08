const base = Deno.env.get('SUPABASE_URL')!;
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
const cors = {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Cache-Control':'no-store',
};
const reply = (status: number, data: unknown) => Response.json(data,{status,headers:cors});
Deno.serve(async request => {
  if (request.method==='OPTIONS') return new Response(null,{headers:cors});
  if (request.method!=='POST') return reply(405,{message:'Method not allowed.'});
  const authorization=request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return reply(401,{message:'Sign in first.'});
  const caller={apikey:anon,Authorization:authorization};
  const elevated={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
  try {
    const access=await fetch(base+'/rest/v1/platform_admins?select=user_id&limit=1',{headers:caller});
    if (!access.ok || !(await access.json()).length) return reply(403,{message:'Main Admin access required.'});
    const input=await request.json();
    if (!input || typeof input!=='object') return reply(400,{message:'Invalid store details.'});
    const {username,password,ownerName,slug,name,type,plan,description,active}=input;
    if (typeof username!=='string'||!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(username)
      ||typeof password!=='string'||password.length<14||new TextEncoder().encode(password).length>72
      ||typeof ownerName!=='string'||!ownerName.trim()||ownerName.length>100
      ||typeof slug!=='string'||slug.length>50||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
      ||typeof name!=='string'||!name.trim()||name.length>100
      ||!['RESTAURANT','CAFE','BAR','HOTEL','ONLINE_STORE','RETAIL','OTHER'].includes(type)
      ||!['Starter','Silver','Gold'].includes(plan)||typeof description!=='string'||description.length>300
      ||typeof active!=='boolean') return reply(400,{message:'Check the store and owner details.'});
    const auth=await fetch(base+'/auth/v1/admin/users',{method:'POST',headers:elevated,
      body:JSON.stringify({email:username+'@owners.enuxes.com',password,email_confirm:true,
        user_metadata:{display_name:ownerName.trim()},app_metadata:{enuxes_owner_username:username}})});
    if (!auth.ok) return reply(auth.status===422?409:400,{message:'Could not create owner. Check the password or choose another username.'});
    const user=await auth.json();
    const result=await fetch(base+'/rest/v1/rpc/provision_store_record',{method:'POST',headers:elevated,
      body:JSON.stringify({p_slug:slug,p_name:name,p_type:type,p_package:plan,p_description:description,p_active:active,p_owner:user.id})});
    if (!result.ok) {
      if (result.status>=400 && result.status<500) {
        const cleanup=await fetch(base+'/auth/v1/admin/users/'+user.id,{method:'DELETE',headers:elevated});
        if (!cleanup.ok) return reply(500,{message:'Store creation failed and the owner account needs review in Supabase.'});
      }
      return reply(409,{message:'Store creation failed. Check whether the link name is already in use.'});
    }
    return reply(201,{id:await result.json()});
  } catch { return reply(500,{message:'Provisioning could not be confirmed. Check Stores and Supabase Authentication before retrying.'}); }
});
