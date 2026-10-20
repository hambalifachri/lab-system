const assert = require('node:assert/strict');
const { hasCurrentEnrollment, wibDate } = require('../netlify/functions/lib/semester-access.cjs');
const now = new Date('2026-10-20T03:00:00Z');
function mock(rows, error = null) {
  return { from(table) {
    let selected = rows[table] || [];
    const q = {
      select() { return q; },
      eq(k,v) { selected = selected.filter(r=>r[k]===v); return q; },
      contains(k,v) { selected = selected.filter(r=>v.every(x=>(r[k]||[]).includes(x))); return q; },
      lte(k,v) { selected = selected.filter(r=>r[k] && r[k]<=v); return q; },
      gte(k,v) { selected = selected.filter(r=>r[k] && r[k]>=v); return q; },
      limit(n) { return Promise.resolve({ data:selected.slice(0,n), error }); }
    }; return q;
  }};
}
const nim = '41223010018';
const row = {id:1,status:'active',participant_nims:[nim],period_start:'2026-09-01',period_end:'2027-02-28'};
(async()=>{
  assert.equal(wibDate(new Date('2026-10-19T17:00:00Z')), '2026-10-20');
  for (const [change, expected] of [
    [{},true], [{period_end:'2026-10-19'},false], [{period_start:'2026-10-21'},false],
    [{status:'archived'},false], [{participant_nims:[]},false],
    [{period_start:'2026-10-20',period_end:'2026-10-20'},true],
    [{period_end:null},false]
  ]) assert.equal(await hasCurrentEnrollment(mock({lab_schedules:[{...row,...change}]}),nim,now),expected);
  const b = {id:2,status:'approved',request_type:'single',participant_nims:[nim],booking_date:'2026-10-20'};
  for (const [change,expected] of [[{},true],[{booking_date:'2026-10-19'},false],[{status:'cancelled'},false],[{request_type:'fixed_schedule'},false]]) {
    assert.equal(await hasCurrentEnrollment(mock({lab_bookings:[{...b,...change}]}),nim,now),expected);
  }
  assert.equal(await hasCurrentEnrollment(mock({}),nim,now),false);
  await assert.rejects(()=>hasCurrentEnrollment(mock({},new Error('Database unavailable')),nim,now));
  console.log('PASS: current/expired/future/archived/missing roster, inclusive dates, WIB, single booking, database failure');
})().catch(e=>{console.error(e);process.exitCode=1;});
