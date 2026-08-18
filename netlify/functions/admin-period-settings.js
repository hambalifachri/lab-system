const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const fallback = [{ period_type:"gasal", start_month:9, start_day:1, end_month:10, end_day:31 }, { period_type:"genap", start_month:3, start_day:1, end_month:5, end_day:31 }];
const response=(statusCode,data)=>({statusCode,headers:{"Content-Type":"application/json","Cache-Control":"no-store"},body:JSON.stringify(data)});
const valid=row=>[row.start_month,row.start_day,row.end_month,row.end_day].every(Number.isInteger)&&row.start_month>=1&&row.start_month<=12&&row.end_month>=1&&row.end_month<=12&&row.start_day>=1&&row.start_day<=31&&row.end_day>=1&&row.end_day<=31;
exports.handler=async event=>{
  if (event.headers["x-admin-token"]!==process.env.ADMIN_TOKEN) return response(401,{status:"error",message:"Akses admin ditolak"});
  if(event.httpMethod==="GET"){const {data,error}=await supabase.from("lab_period_settings").select("period_type,start_month,start_day,end_month,end_day");return response(200,{status:"success",data:error?fallback:(data||fallback),configured:!error});}
  if(event.httpMethod!=="POST")return response(405,{status:"error",message:"Method tidak diizinkan"});
  const rows=Array.isArray(JSON.parse(event.body||"{}").periods)?JSON.parse(event.body||"{}").periods:[];
  if(rows.length!==2||new Set(rows.map(row=>row.period_type)).size!==2||!rows.every(row=>["gasal","genap"].includes(row.period_type)&&valid(row)))return response(400,{status:"error",message:"Data periode Gasal dan Genap tidak valid"});
  const {error}=await supabase.from("lab_period_settings").upsert(rows.map(row=>({...row,updated_at:new Date().toISOString()})),{onConflict:"period_type"});
  if(error)return response(500,{status:"error",message:"Simpan gagal. Jalankan migration Supabase period-settings.sql terlebih dahulu."});
  return response(200,{status:"success",message:"Periode semester berhasil disimpan"});
};
