const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '../frontend');
for (const file of fs.readdirSync(root).filter(f => f.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (script[1].trim()) new vm.Script(script[1], { filename: file });
  }
}
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const formatter = admin.match(/function formatDate\(value\) \{[\s\S]*?\n    \}/)[0];
const booking = fs.readFileSync(path.join(root, 'booking-status.html'), 'utf8');
const accepted = booking.match(/new Date\(row.rules_accepted_at\)\.toLocaleString\([^\n]*?\}\)/)[0];
const originalTZ = process.env.TZ;
try {
  for (const zone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo', 'Asia/Jakarta']) {
    process.env.TZ = zone;
    const instant = '2026-10-19T18:05:06Z';
    const result = vm.runInNewContext(formatter + '; formatDate(' + JSON.stringify(instant) + ')');
    assert.match(result, /20\/10\/2026/);
    assert.match(result, /01[.:]05[.:]06/);
    const notice = vm.runInNewContext(accepted, { row: { rules_accepted_at: instant } });
    assert.match(notice, /20\/10\/2026/);
    assert.match(notice, /01[.:]05[.:]06/);
    for (const file of ['admin-booking.html', 'admin-schedule.html', 'schedule.html']) {
      const html = fs.readFileSync(path.join(root, file), 'utf8');
      const expr = html.match(/new Date\(Date.now\(\) \+ 7 \* 60 \* 60 \* 1000\)\.toISOString\(\)\.slice\(0,10\)/)[0];
      class Clock extends Date { static now() { return Date.parse(instant); } }
      assert.equal(vm.runInNewContext(expr, { Date: Clock }), '2026-10-20');
    }
  }
} finally {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
}
console.log('HTML scripts parse; WIB timestamps and export dates pass in four time zones.');
