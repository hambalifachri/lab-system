const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const fallback = [{ period_type:"gasal", start_month:9, start_day:1, end_month:10, end_day:31 }, { period_type:"genap", start_month:3, start_day:1, end_month:5, end_day:31 }];
exports.handler = async event => {
  if (event.httpMethod !== "GET") return { statusCode:405, body:JSON.stringify({ status:"error", message:"Method tidak diizinkan" }) };
  const { data, error } = await supabase.from("lab_period_settings").select("period_type,start_month,start_day,end_month,end_day");
  return { statusCode:200, headers:{ "Content-Type":"application/json", "Cache-Control":"public, max-age=300" }, body:JSON.stringify({ status:"success", data:error ? fallback : (data || fallback) }) };
};
