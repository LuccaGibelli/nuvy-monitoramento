import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:CORS});}
async function invoke(baseUrl:string,key:string,name:string,body:Record<string,unknown>){
  const response=await fetch(`${baseUrl}/functions/v1/${name}`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`,apikey:key},body:JSON.stringify(body)});
  const text=await response.text(); let payload:any; try{payload=JSON.parse(text)}catch{payload={raw:text}};
  return {function:name,ok:response.ok,status:response.status,payload};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:CORS});
  if(req.method!=="POST") return json({error:"Use POST"},405);
  try{
    const body=await req.json().catch(()=>({}));
    if(!body.organization_id) return json({error:"organization_id is required"},400);
    const supabaseUrl=Deno.env.get("SUPABASE_URL"),serviceRoleKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!supabaseUrl||!serviceRoleKey) throw new Error("Missing Supabase server secrets");
    const shared={organization_id:body.organization_id,days_back:body.days_back??30,max_pages:body.max_pages??150};
    const results=await Promise.all([
      invoke(supabaseUrl,serviceRoleKey,"pncp-sync",{...shared,days_ahead:body.days_ahead??120}),
      invoke(supabaseUrl,serviceRoleKey,"compras-sync",{...shared,include_legacy:body.include_legacy!==false}),
      invoke(supabaseUrl,serviceRoleKey,"source-sync",{organization_id:body.organization_id,connector_ids:body.connector_ids}),
    ]);
    const scanned=results.reduce((n,r)=>n+Number(r.payload?.scanned??0),0);
    const raw=results.reduce((n,r)=>n+Number(r.payload?.raw_upserted??0),0);
    const qualified=results.reduce((n,r)=>n+Number(r.payload?.qualified??r.payload?.selected??0),0);
    const ok=results.every(r=>r.ok);
    return json({ok,summary:{scanned,raw_upserted:raw,qualified},results},ok?200:207);
  }catch(error){return json({error:error instanceof Error?error.message:String(error)},500);}
});
