// Operator PC access only; this does not grant dashboard or Windows administrator rights.
const OPERATOR_NIM = '41813110067';
const isOperator = nim => String(nim || '').trim() === OPERATOR_NIM;
async function lookupStudent(db, nim) {
  const result = await db.from('students').select('nim, nama, aktif').eq('nim', nim).maybeSingle();
  if (result.error) return result;
  if (!isOperator(nim)) return result;
  return { data: {
    nim: OPERATOR_NIM, nama: 'Pengelola - Fachri Hambali',
    // A deliberately disabled student record still blocks this account.
    aktif: result.data ? result.data.aktif : true
  }, error: null };
}
module.exports = { isOperator, lookupStudent };
