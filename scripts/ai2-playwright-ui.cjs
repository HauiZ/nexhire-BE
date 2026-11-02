// Actual frontend routes in Playwright; no harness, JWT injection, or API mocks.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const fe = path.resolve(root, '../Nexthire-FE');
const env = { ...process.env, ...require('dotenv').parse(fs.readFileSync(path.join(root, '.env.local'))) };
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const output = path.join(root, 'trainning/_maintenance/ai2-playwright');
fs.mkdirSync(output, { recursive: true });
const children = [];
const delay = ms => new Promise(r => setTimeout(r, ms));
let browser;
async function readCredentials() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return JSON.parse(input);
}
async function main() {
  const credentials = await readCredentials();
  const { Client } = require('pg');
  const db = new Client({host:env.DB_HOST,port:+env.DB_PORT,user:env.APPLICATION_SERVICE_DB_USER,password:env.APPLICATION_SERVICE_DB_PASS,database:env.APPLICATION_SERVICE_DB_NAME});
  await db.connect();
  const [fixture] = (await db.query("select id,job_id from applications where job_title='Junior Backend Developer — Local AI1 Test' and deleted_at is null limit 1")).rows;
  await db.end();
  assert.ok(fixture);
  const ports = [13000,13001,13002,13003,13004,13005,13006,13007,15174];
  for (const port of ports) {
    const occupied = await new Promise(resolve => {
      const socket = require('node:net').connect(port, '127.0.0.1');
      socket.setTimeout(1000);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false));
      socket.once('timeout', () => { socket.destroy(); resolve(true); });
    });
    assert.ok(!occupied, `Port ${port} already occupied`);
  }
  function start(args, cwd, extra) {
    const child = spawn(process.execPath, args, { cwd, env: { ...env, ...extra }, stdio: 'ignore', windowsHide: true });
    children.push(child);
  }
  start(['dist/apps/auth-service/main.js'],root,{AUTH_SERVICE_PORT:'13001'});
  start(['dist/apps/cv-parsing-service/main.js'],root,{CV_PARSING_SERVICE_PORT:'13006',RABBITMQ_URL:'amqp://127.0.0.1:1',GEMINI_API_KEY:'',OPENAI_API_KEY:''});
  const serviceUrls = Object.fromEntries(['AUTH','CANDIDATE','COMPANY','JOB','APPLICATION'].map((name,i)=>[`${name}_SERVICE_URL`,`http://127.0.0.1:${13001+i}`]));
  start(['dist/apps/gateway/main.js'],root,{...serviceUrls,GATEWAY_PORT:'13000',FRONTEND_URL:'http://127.0.0.1:15174'});
  for (const [name,port] of [['candidate',13002],['company',13003],['job',13004],['application',13005]]) {
    const suffix=`ai2-ui-${Date.now()}`;
    start([`dist/apps/${name}-service/main.js`],root,{...serviceUrls,[`${name.toUpperCase()}_SERVICE_PORT`]:String(port),MATCHING_SERVICE_URL:'http://127.0.0.1:13007',CV_PARSING_SERVICE_URL:'http://127.0.0.1:13006',
      APPLICATION_SERVICE_JOB_LIFECYCLE_QUEUE:`${suffix}-job`,APPLICATION_SERVICE_MATCHING_COMPLETED_QUEUE:`${suffix}-matching`,APPLICATION_SERVICE_CV_PARSED_QUEUE:`${suffix}-cv`});
  }
  const matching=spawn(path.join(root,'apps/matching-service/.venv/Scripts/python.exe'),['-m','uvicorn',process.env.AI2_UI_READ_ONLY === 'true' ? 'ai2-e2e-matching:app' : 'ai2-e2e-matching-worker:app','--host','127.0.0.1','--port','13007','--no-access-log'],{
    cwd:root,env:{...env,PYTHONPATH:`${path.join(root,'apps/matching-service')}${path.delimiter}${path.join(root,'scripts')}`,NODE_ENV:'development',AI2_E2E_APPLICATION_ID:fixture.id,JOB_SERVICE_URL:'http://127.0.0.1:13004',CANDIDATE_SERVICE_URL:'http://127.0.0.1:13002',MATCHING_AI1_BACKEND:'local_m1',MATCHING_AI1_MANIFEST_PATH:path.join(root,'trainning/ai1/exports/kaggle-ranking-v1/shadow-ranking-retention.json'),MATCHING_AI1_MANIFEST_SHA256:'bdfc4c0aef381cc73de2447251a27d4f1381f3787606833f79657931190620d4',HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',MATCHING_AI2_DEMO_ENABLED:'true',MATCHING_AI2_DEMO_ARTIFACT_PATH:path.join(root,'trainning/ai2/demo-artifact-v1')},stdio:'ignore',windowsHide:true});
  children.push(matching);
  start(['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','15174','--strictPort'],fe,{VITE_API_BASE_URL:'http://127.0.0.1:13000/api/v1',VITE_AI2_DEMO_ENABLED:'true'});
  for (const port of ports) {
    let served = false;
    for(let i=0;i<120;i++){try{await fetch(`http://127.0.0.1:${port}/`);served=true;break}catch{}await delay(250)}
    assert.ok(served,`Service ${port} unavailable`);
  }
  const poolFixturePath=path.join(output,'pool-fixture.json');
  const poolFixture=fs.existsSync(poolFixturePath)?JSON.parse(fs.readFileSync(poolFixturePath,'utf8')):null;
  if (poolFixture && process.env.AI2_GENERATE_POOL === 'true') {
    const generation=spawn(path.join(root,'apps/matching-service/.venv/Scripts/python.exe'),['scripts/ai2-pool-fixtures.py',poolFixturePath],{
      cwd:root,env:{...env,PYTHONPATH:path.join(root,'apps/matching-service'),JOB_SERVICE_URL:'http://127.0.0.1:13004',MATCHING_AI1_BACKEND:'local_m1',MATCHING_AI1_MANIFEST_PATH:path.join(root,'trainning/ai1/exports/kaggle-ranking-v1/shadow-ranking-retention.json'),MATCHING_AI1_MANIFEST_SHA256:'bdfc4c0aef381cc73de2447251a27d4f1381f3787606833f79657931190620d4',HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1'},stdio:['ignore','pipe','pipe'],windowsHide:true});
    children.push(generation);
    let diagnostic=''; generation.stderr.on('data',d=>{diagnostic+=d});
    const code=await new Promise(resolve=>generation.on('exit',resolve));
    if(code!==0) console.error(diagnostic.slice(-3000));
    assert.equal(code,0,'Synthetic real-model inference failed');
  }
  browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  const page = await context.newPage();
  const errors=[];
  page.on('pageerror',()=>errors.push('pageerror'));
  await page.goto('http://127.0.0.1:15174/recruiter/login');
  await page.locator('input[type="password"]').waitFor();
  await page.locator('.global-loader-overlay').waitFor({state:'hidden'});
  await page.locator('input[type="email"]').fill(credentials.email);
  await page.locator('input[type="password"]').fill(credentials.password);
  const loginResponse = page.waitForResponse(r=>r.url().includes('/auth/login') && r.request().method()==='POST');
  await page.locator('button[type="submit"]').click();
  assert.equal((await loginResponse).status(),200,'Real login failed');
  credentials.password='';
  await page.waitForURL(url=>!url.pathname.includes('/login'));
  await page.goto('http://127.0.0.1:15174/recruiter/applications');
  await page.locator('.global-loader-overlay').waitFor({state:'hidden'});
  await page.screenshot({path:path.join(output,'applications-before-selection.png'),fullPage:true});
  const titles = await page.locator('.recruiter-applications-table__job').allTextContents();
  console.log('Visible application job titles:',JSON.stringify(titles));
  console.log('Job filter options:',JSON.stringify(await page.locator('select option').allTextContents()));
  const row=page.locator('tr').filter({hasText:/Junior Backend Developer — Local AI1 Test/i}).first();
  if (await row.count() === 0) {
    const receipt={date:'2026-10-29',tool:'Playwright',realFrontend:true,apiMock:false,jwtInjection:false,
      passed:['Real recruiter login via UI','Real recruiter applications list rendered'],
      visibleJobTitles:titles,blocked:['No Junior Frontend application in this local recruiter account; no substitute selected'],complete:false};
    fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2));
    console.log(JSON.stringify(receipt,null,2));
    await context.close();
    return;
  }
  await row.waitFor({timeout:20000});
  await row.locator('button').first().click();
  const drawer=page.getByRole('dialog');
  await drawer.waitFor();
  await drawer.getByRole('region',{name:'Gợi ý thứ tự xem hồ sơ'}).waitFor();
  const ai2Url=`http://127.0.0.1:13000/api/v1/recruiter/applications/${fixture.id}/ai2-demo`;
  const readAi2=()=>page.evaluate(async url=>{const token=sessionStorage.getItem('nexhire_access_token')??localStorage.getItem('nexhire_access_token');const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw new Error('AI2 read failed');return (await r.json()).data},ai2Url);
  const previous=await readAi2();
  let request = { id: null }, fresh = previous;
  if (process.env.AI2_UI_READ_ONLY !== 'true') {
  const postPromise=page.waitForResponse(r=>r.url().endsWith(`/${fixture.id}/match`)&&r.request().method()==='POST',{timeout:30000});
  await drawer.getByRole('button',{name:'Truy hồi bằng chứng',exact:true}).click();
  const post=await postPromise;
  console.log('Matching POST HTTP status:',post.status());
  if(!post.ok()) console.log('Matching POST error:',JSON.stringify(await post.json()));
  assert.ok(post.ok(),'Matching POST failed');
  request=(await post.json()).data;
  assert.ok(request.id,'New request id required');
  for(let i=0;i<90;i++){
    await delay(1000);
    fresh=await readAi2();
    if(fresh.status==='READY'&&fresh.resultId!==previous.resultId)break;
  }
  assert.equal(fresh.status,'READY');
  assert.notEqual(fresh.resultId,previous.resultId,'Must use a newly processed result');
  const status=await page.evaluate(async url=>{const token=sessionStorage.getItem('nexhire_access_token')??localStorage.getItem('nexhire_access_token');return (await (await fetch(url,{headers:{Authorization:`Bearer ${token}`}})).json()).data},ai2Url.replace('/ai2-demo','/matching-status'));
  assert.equal(status.matchRequestId,request.id,'Fresh result must belong to UI request');
  console.log('New matching request processed:',JSON.stringify({requestId:request.id,resultId:fresh.resultId,status:fresh.status}));
  }
  const panel=drawer.getByRole('region',{name:'Gợi ý thứ tự xem hồ sơ'});
  console.log('Stored AI2 status:',JSON.stringify({status:fresh.status,resultId:fresh.resultId}));
  await panel.locator('h3').waitFor();
  console.log('Panel before assertion:',await panel.innerText());
  await panel.getByText('Chưa có thứ tự so sánh',{exact:true}).waitFor({timeout:120000});
  const details=panel.locator('details');
  assert.equal(await details.getAttribute('open'),null);
  const panelText=await panel.innerText();
  assert.ok(!panelText.includes('1.2586')&&!panelText.includes('ai2-demo-xgb'));
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,'hr-friendly-ai2.png'),fullPage:true});
  await details.locator('summary').click();
  await details.getByText('Điểm thô của mô hình',{exact:true}).waitFor();
  assert.ok((await details.innerText()).includes(fresh.score.toFixed(4)));
  await details.locator('summary').click();
  await page.screenshot({path:path.join(output,'junior-backend-ai2-drawer.png'),fullPage:true});
  await page.reload();
  await page.locator('.global-loader-overlay').waitFor({state:'hidden'});
  const reopened=page.locator('tr').filter({hasText:/Junior Backend Developer — Local AI1 Test/i}).first();
  if (!await page.getByRole('dialog').count()) await reopened.locator('button').first().click();
  await page.getByRole('dialog').getByRole('region',{name:'Gợi ý thứ tự xem hồ sơ'}).getByText('Chưa có thứ tự so sánh',{exact:true}).waitFor({timeout:30000});
  await page.goto(`http://127.0.0.1:15174/recruiter/applications?jobId=${fixture.job_id}`);
  const orderList=page.getByRole('region',{name:'Danh sách gợi ý xem hồ sơ'});
  await orderList.getByRole('button',{name:'Tải thứ tự gợi ý'}).click();
  await orderList.getByRole('status').filter({hasText:'Chưa thể so sánh toàn bộ nhóm.'}).waitFor({timeout:30000});
  await orderList.scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,'review-order-single.png'),fullPage:true});
  let poolChecks=null;
  if(poolFixture){
    await page.goto(`http://127.0.0.1:15174/recruiter/applications?jobId=${poolFixture.jobId}`);
    const group=page.getByRole('region',{name:'Danh sách gợi ý xem hồ sơ'});
    const responsePromise=page.waitForResponse(r=>r.url().includes('/ai2-pool')&&r.request().method()==='GET');
    await group.getByRole('button',{name:'Tải thứ tự gợi ý'}).click();
    const response=await responsePromise;
    assert.equal(response.status(),200);
    const pool=(await response.json()).data;
    assert.equal(pool.status,'READY');assert.equal(pool.comparedCount,3);
    await group.locator('li').nth(2).waitFor({timeout:30000});
    const buttons=group.locator('li button');
    const labels=await buttons.allTextContents();
    const names=new Map(poolFixture.applications.map((a,i)=>[a.id,`Synthetic AI2 Applicant ${i+1}`]));
    for(let i=0;i<3;i++)assert.ok(labels[i].includes(`Thứ ${pool.items[i].rankingPosition} — ${names.get(pool.items[i].applicationId)}`));
    const tie=pool.items.filter(x=>poolFixture.applications.slice(0,2).some(a=>a.id===x.applicationId));
    assert.equal(tie[0].rankingPosition,tie[1].rankingPosition,'Identical evidence must share rank');
    await group.scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,'multi-candidate-ready.png'),fullPage:true});
    await buttons.first().click();
    const selected=page.getByRole('dialog');
    await selected.getByRole('heading',{name:names.get(pool.items[0].applicationId),exact:true}).waitFor();
    await selected.getByRole('region',{name:'Gợi ý thứ tự xem hồ sơ'}).getByText(`Gợi ý xem thứ ${pool.items[0].rankingPosition} trong 3 hồ sơ`,{exact:true}).waitFor({timeout:30000});
    poolChecks={comparedCount:3,positions:pool.items.map(x=>x.rankingPosition),apiUiOrderMatch:true,sharedTie:true,correctDrawer:true};
  }
  assert.equal(errors.length,0);
  const receipt={date:'2026-10-30',tool:'Playwright',realFrontend:true,apiMock:false,jwtInjection:false,
    passed:['Real recruiter login via UI','Real applications page loaded','Junior Backend Developer — Local AI1 Test opened through row action','AI2 panel visible in actual drawer','No uncaught browser exceptions'],
    poolChecks,panelText,requestId:request.id,resultId:fresh.resultId,complete:true,limitations:['No hiring decisions, new CV upload or external parse in this run','Scoped real worker processes only new requests for selected application']};
  fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2));
  console.log(JSON.stringify(receipt,null,2));
  await context.close();
}
main().catch(error=>{console.error(error.name, error.message || 'E2E assertion failed', error.stack?.split('\n').slice(1,3).join('\n'));process.exitCode=1}).finally(async()=>{
  await browser?.close();
  for(const child of children.reverse()){
    if(child.exitCode===null){child.kill();await Promise.race([new Promise(r=>child.once('exit',r)),delay(3000)])}
  }
});
