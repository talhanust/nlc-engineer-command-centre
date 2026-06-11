/* SMOKE TEST — Consolidated IPC + RAR Registers (Phase D S3, v1.15.0) */
const fs = require('fs');
const src = fs.readFileSync('FGEHA_NLC_F14F15_UnifiedControl_v1_0.html', 'utf8');
const boqMatch = src.match(/<script id="boq-data" type="application\/json">([\s\S]*?)<\/script>/);
const js = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).reduce((a,b)=>a.length>b.length?a:b);
const definedIds = new Set(); let m; const idRe=/id="([^"]+)"/g; while((m=idRe.exec(src))!==null) definedIds.add(m[1]);
const elements={};
function makeEl(id){ if(!elements[id]){elements[id]={id,value:'',textContent:'',innerHTML:'',checked:false,classList:{_set:new Set(),add(c){this._set.add(c)},remove(c){this._set.delete(c)},toggle(){},contains(c){return this._set.has(c)}},dataset:{},style:{removeProperty(){}},options:[],_children:[],parentElement:{innerHTML:''},addEventListener(){},appendChild(c){this._children.push(c)},remove(){},getContext:()=>({canvas:{}}),width:800,height:400,disabled:false,querySelectorAll:()=>[]}; if(id==='boq-data')elements[id].textContent=boqMatch[1];} return elements[id]; }
global.localStorage={_s:{},getItem(k){return this._s[k]||null},setItem(k,v){this._s[k]=String(v)},removeItem(k){delete this._s[k]}};
global.confirm=()=>true; global.alert=()=>{}; global.prompt=()=>''; global.toast=()=>{};
const TEST_NOW=new Date('2026-05-18T00:00:00.000Z').getTime(); const OD=global.Date;
global.Date=class extends OD{constructor(...a){if(a.length===0)super(TEST_NOW);else super(...a)}static now(){return TEST_NOW}};
global.document={documentElement:{setAttribute(){},getAttribute:()=>'light'},getElementById:id=>(definedIds.has(id)||elements[id])?makeEl(id):null,querySelectorAll:()=>[],addEventListener(){},createElement:tag=>({tagName:tag,value:'',textContent:'',innerHTML:'',click(){},style:{removeProperty(){}},classList:{add(){},remove(){}},parentElement:null,remove(){},appendChild(){},querySelectorAll:()=>[],getContext:()=>({})})};
global.window={matchMedia:()=>({matches:false,addEventListener(){}}),getComputedStyle:()=>({getPropertyValue:()=>''}),print(){}};
global.getComputedStyle=()=>({getPropertyValue:()=>''}); global.Blob=class{}; global.URL={createObjectURL:()=>'x',revokeObjectURL(){}}; global.FileReader=class{readAsText(){}}; global.setTimeout=fn=>{try{fn()}catch(e){}return 0}; global.XLSX={utils:{aoa_to_sheet:()=>({}),book_new:()=>({}),book_append_sheet(){}},writeFile(){}}; global.Chart=class{constructor(){}destroy(){}update(){}};
let app;
try { app=new Function(js+'\n; if(typeof boot==="function")boot(); return { state, collectNodeDocs, renderNodeRegistersHtml, renderCommandCenter, switchActiveProject, addProject, switchModule, migrateToOrgTree, partitionProjectData, migrateAccessControl };')(); }
catch(e){ console.log('boot threw:', e.message); process.exit(1); }
let passed=0,failed=0;
function assert(l,c,d){ if(c){passed++;console.log('  \u2713 '+l)}else{failed++;console.log('  \u2717 '+l+(d?' \u2014 '+d:''))} }
function assertEq(l,g,e){ assert(l,g===e,`got ${JSON.stringify(g)}, expected ${JSON.stringify(e)}`) }
console.log('='.repeat(60)); console.log(' REGISTERS SMOKE TEST — Phase D S3 (v1.15.0)'); console.log('='.repeat(60));
delete app.state.org; app.migrateToOrgTree(); app.partitionProjectData(); app.migrateAccessControl();
app.switchActiveProject('proj-f14f15');
app.state.commercial.ipcs.push({ipcNo:'IPC-01',period:'Mar',status:'paid',gross:1000,netPayable:900});
app.state.commercial.ipcs.push({ipcNo:'IPC-02',period:'Apr',status:'draft',gross:500,netPayable:450});
app.state.commercial.rars = app.state.commercial.rars || [];
app.state.commercial.rars.push({rarNo:'RAR-A-01',subId:'SUB1',subType:'civil',status:'approved',gross:300,netPayable:270});
const projB = app.addProject('pd-centre', {name:'Lahore Bypass'});
projB.data.commercial.ipcs.push({ipcNo:'IPC-01',period:'Mar',status:'draft',gross:250,netPayable:230});
projB.data.commercial.rars = [{rarNo:'RAR-B-01',subId:'SUBX',status:'draft',gross:75,netPayable:70}];

console.log('\nGroup 1 — collection + scoping');
assert('collectNodeDocs callable', typeof app.collectNodeDocs==='function');
const rootIpcs = app.collectNodeDocs('hq-nlc','ipcs');
const northIpcs = app.collectNodeDocs('pd-north','ipcs');
const centreIpcs = app.collectNodeDocs('pd-centre','ipcs');
assertEq('pd-north IPC count = 2', northIpcs.length, 2);
assertEq('pd-centre IPC count = 1', centreIpcs.length, 1);
assertEq('root IPC count = 3 (all subtree)', rootIpcs.length, 3);
assert('SCOPING: root IPCs == north + centre', rootIpcs.length === northIpcs.length + centreIpcs.length);
assert('each row tagged with project name', rootIpcs.every(e=>e.projectName && e.doc));
assert('rows carry the project they belong to', rootIpcs.some(e=>e.projectName==='Lahore Bypass') && rootIpcs.some(e=>e.projectName.includes('F-14')));
const rootRars = app.collectNodeDocs('hq-nlc','rars');
assertEq('root RAR count = 2', rootRars.length, 2);
assertEq('pd-centre RAR count = 1', app.collectNodeDocs('pd-centre','rars').length, 1);

console.log('\nGroup 2 — render');
app.state.org.activeNodeId='hq-nlc'; app.switchModule('command');
const host = elements['commandHost'].innerHTML;
assert('registers render in command center', host.includes('cmd-registers') && host.includes('IPC register') && host.includes('RAR register'));
assert('IPC numbers shown', host.includes('IPC-01') && host.includes('IPC-02'));
assert('RAR numbers shown', host.includes('RAR-A-01') && host.includes('RAR-B-01'));
assert('project column present in register', host.includes('Lahore Bypass'));
assert('IPC count header reflects 3', host.includes('IPC register \u2014 3'));

console.log('\n'+'='.repeat(60));
console.log(' REGISTERS TEST RESULTS: '+passed+' passed, '+failed+' failed');
console.log('='.repeat(60));
process.exit(failed>0?1:0);
