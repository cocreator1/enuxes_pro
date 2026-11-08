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
    if (input.action==='update-owner-password') {
      const {storeId,password}=input;
      if (typeof storeId!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(storeId)
        ||typeof password!=='string'||password.length<14||new TextEncoder().encode(password).length>72)
        return reply(400,{message:'Enter a password with at least 14 characters and at most 72 UTF-8 bytes.'});
      const rows=async (path: string)=>{
        const response=await fetch(base+'/rest/v1/'+path,{headers:elevated});
        if(!response.ok)throw new Error('Account lookup failed.');
        return response.json();
      };
      const members=await rows('business_members?select=user_id&business_id=eq.'+storeId);
      const owners=[];
      for(const {user_id:id} of members){
        if(!(await rows('platform_admins?select=user_id&user_id=eq.'+id)).length)owners.push(id);
      }
      if(owners.length!==1)return reply(409,{message:'This store needs exactly one assigned owner account separate from Main Admin.'});
      const [id]=owners;
      if((await rows('business_members?select=business_id&user_id=eq.'+id+'&limit=2')).length!==1)
        return reply(409,{message:'This owner account is shared by multiple stores.'});
      const updated=await fetch(base+'/auth/v1/admin/users/'+id,{
        method:'PUT',headers:elevated,body:JSON.stringify({password})
      });
      if(!updated.ok)return reply(400,{message:'The password could not be updated. Check the password and try again.'});
      return reply(200,{updated:true});
    }
    const {username,password,ownerName,slug,type,plan,pack}=input;
    if (typeof username!=='string'||!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(username)
      ||typeof password!=='string'||password.length<14||new TextEncoder().encode(password).length>72
      ||typeof ownerName!=='string'||!ownerName.trim()||ownerName.length>100
      ||typeof slug!=='string'||slug.length>50||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
      ||!['RESTAURANT','CAFE','BAR','HOTEL','ONLINE_STORE','RETAIL','OTHER'].includes(type)
      ||!['Starter','Silver','Gold'].includes(plan)||!['clothing','general','restaurant','bar','barbershop','fallback'].includes(pack)) return reply(400,{message:'Check the store and owner details.'});
    const auth=await fetch(base+'/auth/v1/admin/users',{method:'POST',headers:elevated,
      body:JSON.stringify({email:username+'@owners.enuxes.com',password,email_confirm:true,
        user_metadata:{display_name:ownerName.trim()},app_metadata:{enuxes_owner_username:username,enuxes_initial_slug:slug}})});
    let user;
    if (auth.ok) user=await auth.json();
    else {
      if (auth.status!==422) return reply(400,{message:'Could not create owner. Check the owner details.'});
      const retry=await fetch(base+'/auth/v1/token?grant_type=password',{method:'POST',
        headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({email:username+'@owners.enuxes.com',password})});
      if (!retry.ok) return reply(409,{message:'Choose another username, or retry with the original password.'});
      user=(await retry.json()).user;
      if(user?.app_metadata?.enuxes_initial_slug!==slug)return reply(409,{message:'That username belongs to another store.'});
    }
    const result=await fetch(base+'/rest/v1/rpc/provision_store_draft',{method:'POST',headers:elevated,
      body:JSON.stringify({p_slug:slug,p_type:type,p_package:plan,p_pack:pack,p_owner:user.id})});
    if (!result.ok) return reply(409,{message:'Draft could not be saved. Check the link name and image pack. You can retry with the same owner credentials.'});
    return reply(201,{id:await result.json()});
  } catch { return reply(500,{message:'Provisioning could not be confirmed. Check Stores and Supabase Authentication before retrying.'}); }
});
