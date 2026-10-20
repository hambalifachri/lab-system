const assert = require('node:assert/strict');
const { isOperator, lookupStudent } = require('../netlify/functions/lib/operator-access.cjs');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const operator = '41813110067';
const calls = [];
let disabled = false;
const db = {from(table) {
  const q = {
    select(){return q;}, eq(){return q;},
    single(){return q.maybeSingle();},
    maybeSingle(){return Promise.resolve({data: table === 'students' && disabled ? {aktif:false} : null,error:null});},
    upsert(value){calls.push({table,value});return Promise.resolve({error:null});},
    insert(value){calls.push({table,value});return Promise.resolve({error:null});}
  }; return q;
}};
function loadLogin(){
  const file = path.resolve(__dirname,'../netlify/functions/login.js');
  const sandbox={exports:{},process:{env:{}},console,Date,require(name){
    if(name==='@supabase/supabase-js')return {createClient:()=>db};
    return require(path.resolve(path.dirname(file),name));
  }};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),sandbox);
  return sandbox.exports.handler;
}
(async()=>{
  assert(isOperator(operator)); assert(!isOperator('41813110068'));
  assert.equal((await lookupStudent(db,operator)).data.nama,'Pengelola - Fachri Hambali');
  const login=loadLogin();
  const request={httpMethod:'POST',body:JSON.stringify({nim:operator,computer_name:'SIPIL-01',device_id:'SIPIL-01'})};
  const response=await login(request);
  assert.equal(response.statusCode,200);
  assert(calls.some(c=>c.table==='active_sessions' && c.value.nim===operator));
  assert(!calls.some(c=>c.table==='login_logs'));
  disabled=true;calls.length=0;
  assert.equal((await login(request)).statusCode,403);
  assert.equal(calls.length,0);
  const badDb={from(){return {select(){return this;},eq(){return this;},maybeSingle(){return {error:new Error('offline'),data:null};}};}};
  assert((await lookupStudent(badDb,operator)).error);
  console.log('PASS operator login: active session retained, no usage history, disabled account and database errors respected');
})().catch(e=>{console.error(e);process.exitCode=1;});
