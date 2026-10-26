const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async()=>{
  const browser = await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    const page = await browser.newPage();
    let allow = false;
    await page.route('**/*',route=>{
      const url = new URL(route.request().url());
      if(url.hostname !== 'lab.test') return route.abort();
      if(url.pathname === '/') return route.fulfill({contentType:'text/html',body:fs.readFileSync('frontend/index.html','utf8')});
      if(url.pathname.endsWith('/login')) return route.fulfill({json:allow ? {status:'success',nim:'41813110067',nama:'Pengelola',device_id:'SIPIL-01',computer_name:'SIPIL-01'} : {status:'error',message:'Ditolak'}});
      return route.fulfill({json:{status:'success'}});
    });
    page.on('dialog',d=>d.dismiss());
    await page.goto('http://lab.test/?pc=SIPIL-01');
    await page.fill('#nim','41813110067');
    await page.evaluate(()=>login());
    await page.waitForTimeout(200);
    assert(!(await page.title()).includes('LOGIN_OK'));
    allow=true;
    await page.evaluate(()=>login());
    await page.waitForFunction(()=>document.title==='Login Lab Komputer - LOGIN_OK - SIPIL-01');
    assert((await page.locator('#app').innerText()).includes('Login berhasil'));
    const script=fs.readFileSync('windows/lab-login.ahk','utf8');
    assert(script.includes('RequireFreshLogin := !ResetSessionOnStartup()'));
    const detect=script.slice(script.indexOf('DetectSuccessfulLogin(hwnd) {'),script.indexOf('StopLoginGuard() {'));
    assert(detect.includes('attempts < 3'));
    assert(detect.includes('SetTimer CheckLoginStatus, -1'));
    assert(!detect.includes('SetLoginScreen(false)'));
    console.log('PASS: denied login has no signal; successful login signals correct PC; client verifies server and limits retries.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
