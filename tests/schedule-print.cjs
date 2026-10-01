const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const days = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const courses = ['Analisis Struktur I','Mekanika Tanah','Gambar Teknik','Pemodelan BIM','Manajemen Konstruksi'];
const schedules = ['C.413','C.405'].flatMap((room,lab) => Array.from({length:30},(_,i) => ({
  id: lab*100+i+1, room_name:`Lab ${room}`, day_name:days[Math.floor(i/5)],
  start_time:`${String(7+i%5*2).padStart(2,'0')}:30:00`, end_time:`${String(9+i%5*2).padStart(2,'0')}:30:00`,
  subject:courses[i%5], class_name:lab?'Arsitektur 3A':'Sipil 3A', lecturer_name:'Dr. Nama Dosen Penguji, S.T., M.T.',
  semester_label:'2026/2027 Semester Gasal', period_start:'2026-09-01',period_end:'2027-02-28'
})));
const booking = {id:999, room_name:'Lab C.413', day_name:'Sabtu', booking_date:'2026-12-12',start_time:'08:00:00',end_time:'10:00:00',purpose:'Workshop Pemodelan',class_name:'Umum',borrower_name:'Penanggung Jawab Pengujian'};

(async () => {
  fs.mkdirSync(path.join(root,'tmp/pdfs'),{recursive:true});
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    const page = await browser.newPage({viewport:{width:1280,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    let fixture={status:'success',schedules,bookings:[]};
    await page.route('http://lab.test/**', async route => {
      const url=new URL(route.request().url());
      if(url.pathname.includes('/.netlify/functions/')) return route.fulfill({json:fixture});
      const file=path.join(root,'frontend',url.pathname==='/'?'schedule.html':url.pathname.slice(1));
      return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});
    });
    await page.goto('http://lab.test/schedule.html');
    await page.waitForFunction(()=>document.querySelector('[data-print-room]').disabled===false);
    await page.selectOption('#periodSelect','2026/2027');
    await page.selectOption('#semesterSelect','gasal');
    await page.waitForFunction(()=>document.querySelector('[data-print-room]').disabled===false);
    await page.click('[data-print-room="C.413"]');
    async function check(expected,room){
      const actual=await page.evaluate(()=>({
        rows:document.querySelectorAll('.schedule-sheet tbody tr').length,
        pages:document.querySelectorAll('.schedule-sheet').length,
        signatures:document.querySelectorAll('.schedule-signatures').length,
        fits:[...document.querySelectorAll('.schedule-sheet-body')].every(e=>e.scrollHeight<=e.clientHeight+1),
        last:!!document.querySelector('.schedule-sheet:last-child .schedule-signatures'),
        rooms:[...document.querySelectorAll('.schedule-lab strong')].map(x=>x.textContent),
        ids:[...document.querySelectorAll('[data-record-id]')].map(x=>x.dataset.recordId)
      }));
      assert.equal(actual.rows,expected);assert.equal(actual.signatures,1);assert.equal(actual.last,true);assert.equal(actual.fits,true);
      assert.equal(new Set(actual.ids).size,expected);assert(actual.rooms.every(r=>r===room));return actual;
    }
    const initial=await check(30,'C.413');
    assert.equal(initial.pages,2);
    await page.emulateMedia({media:'print'});
    await check(30,'C.413');
    await page.pdf({path:path.join(root,'tmp/pdfs/c413-dense.pdf'),preferCSSPageSize:true,printBackground:true});
    await page.emulateMedia({media:'screen'});
    await page.evaluate(()=>LabSchedulePrint.close());
    await page.click('[data-print-room="C.405"]'); await check(30,'C.405');
    await page.evaluate(()=>LabSchedulePrint.close());
    await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
    assert.equal(await page.locator('.schedule-sheet tbody tr').count(),60);
    assert.equal(await page.locator('.schedule-signatures').count(),2);
    await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
    assert.equal(await page.locator('.schedule-sheet').count(),0);
    await page.click('[data-day="Senin"]');
    await page.click('[data-print-room="C.413"]'); await check(5,'C.413');
    await page.evaluate(()=>LabSchedulePrint.close());
    fixture={status:'success',schedules,bookings:[booking]};
    await page.reload(); await page.waitForFunction(()=>document.querySelector('[data-print-room]').disabled===false);
    await page.click('[data-print-room="C.413"]');
    await check(31,'C.413');assert((await page.locator('.schedule-print-root').innerText()).includes('12 Desember 2026'));
    await page.evaluate(()=>LabSchedulePrint.close());
    // Dates and HTML-like input must be preserved as literal text, never markup.
    fixture={status:'success', schedules:[{...schedules[0],subject:'Struktur <img src=x onerror=alert(1)> & Beton',period_end:'2026-10-31'},schedules[1]],bookings:[]};
    await page.reload(); await page.waitForFunction(()=>document.querySelector('[data-print-room]').disabled===false);
    await page.click('[data-print-room="C.413"]'); await check(2,'C.413');
    assert.equal(await page.locator('.schedule-print-root img').count(),0);
    assert((await page.locator('.schedule-print-root').innerText()).includes('31 Oktober 2026'));
    await page.evaluate(()=>LabSchedulePrint.close());
    fixture={status:'success',schedules:schedules.slice(0,30).map(row=>({...row,subject:'Pemodelan dan Analisis Struktur Bangunan Bertingkat dengan Metode Elemen Hingga',lecturer_name:'Dr. Ir. Nama Dosen Pengampu Mata Kuliah Laboratorium, S.T., M.T.'})),bookings:[]};
    await page.reload(); await page.waitForFunction(()=>document.querySelector('[data-print-room]').disabled===false);
    await page.click('[data-print-room="C.413"]');await check(30,'C.413');
    await page.evaluate(()=>LabSchedulePrint.close());
    fixture={status:'success',schedules:[],bookings:[]};
    await page.reload(); await page.waitForFunction(()=>document.querySelector('[data-print-room]').disabled===false);
    await page.click('[data-print-room="C.405"]');await check(0,'C.405');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:true,dense:initial,checks:['room isolation','30 rows, no clipping','print media','day filter','single booking date','mixed periods','HTML escaping','empty lab','signatures only last page']}));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
