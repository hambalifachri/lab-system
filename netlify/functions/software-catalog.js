const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const response = (statusCode, body) => ({ statusCode, headers: { 'Content-Type':'application/json', 'Cache-Control':'no-store' }, body: JSON.stringify(body) });
const admin = event => event.headers['x-admin-token'] && event.headers['x-admin-token'] === process.env.ADMIN_TOKEN;

exports.handler = async event => {
  try {
    if (event.httpMethod === 'GET') {
      const { data, error } = await supabase.from('lab_software').select('id,software_name,version,license_type,license_status,expires_on,notes,lab_rooms(room_name)').order('software_name');
      if (error) return response(200, { status:'success', data:[], setup_required:true });
      return response(200, { status:'success', data:data || [] });
    }
    if (!admin(event)) return response(401,{status:'error',message:'Akses admin ditolak'});
    const body = JSON.parse(event.body || '{}');
    if (body.action === 'delete') {
      const { error } = await supabase.from('lab_software').delete().eq('id', Number(body.id));
      if (error) throw error;
      return response(200,{status:'success',message:'Software dihapus'});
    }
    const item = body.item || {};
    if (!String(item.software_name || '').trim() || !String(item.license_type || '').trim()) return response(400,{status:'error',message:'Nama software dan lisensi wajib diisi'});
    const row = { software_name:String(item.software_name).trim(), version:String(item.version || '').trim() || null, license_type:String(item.license_type).trim(), license_status:item.license_status === 'expires' ? 'expires' : 'lifetime', expires_on:item.license_status === 'expires' ? item.expires_on : null, room_id:item.room_id ? Number(item.room_id) : null, notes:String(item.notes || '').trim() || null, updated_at:new Date().toISOString() };
    if (row.license_status === 'expires' && !row.expires_on) return response(400,{status:'error',message:'Tanggal kedaluwarsa wajib diisi'});
    const query = item.id ? supabase.from('lab_software').update(row).eq('id', Number(item.id)) : supabase.from('lab_software').insert(row);
    const { error } = await query;
    if (error) throw error;
    return response(200,{status:'success',message:item.id?'Software diperbarui':'Software ditambahkan'});
  } catch (error) { return response(500,{status:'error',message:'Data software belum dapat disimpan. Pastikan SQL katalog software sudah dijalankan.'}); }
};
