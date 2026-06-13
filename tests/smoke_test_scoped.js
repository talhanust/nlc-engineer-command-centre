/* SMOKE TEST — Access-scoped rollups (Phase D S4, v1.16.0) */
const fs=require('fs');
const src=fs.readFileSync('FGEHA_NLC_F14F15_UnifiedControl_v1_0.html','utf8');
const boqMatch=src.match(/<script id="boq-data" type="application\/json">([\s\S]*?)<\/script>/);
const js=[...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).reduce((a,b)=>a.length>b.length?a:b);
const definedIds=new Set();let m;const idRe=/id="([^"]+)"/g;while((m=idRe.exec(src))!==null)definedIds.add(m[1]);
const elements={};
function makeEl(id){if(!elements[id]){elements[id]={id,value:'',textContent:'',innerHTML:'',checked:false,classList:{_set:new Set(),add(c){this._set.add(c)},remove(c){this._set.delete(c)},toggle(){},contains(c){return this._set.has(c)}},dataset:{},style:{removeProperty(){}},options:[],_children:[],parentElement:{innerHTML:''},addEventListener(){},appendChild(c){this._children.push(c)},remove(){},getContext:()=>({canvas:{}}),width:800,height:400,disabled:false,querySelectorAll:()=>[]};if(id==='boq-data')elements[id].textContent=boqMatch[1];}return elements[id];}
global.localStorage={_s:{},getItem(k){return this._s[k]||null},setItem(k,v){this._s[k]=String(v)},removeItem(k){delete this._s[k]}};
global.confirm=()=>true;global.alert=()=>{};global.prompt=()=>'';global.toast=()=>{};
const TEST_NOW=new Date('2026-05-18T00:00:00.000Z').getTime();const OD=global.Date;
global.Date=class extends OD{constructor(...a){if(a.length===0)super(TEST_NOW);else super(...a)}static now(){return TEST_NOW}};
global.document={documentElement:{setAttribute(){},getAttribute:()=>'light'},getElementById:id=>(definedIds.has(id)||elements[id])?makeEl(id):null,querySelectorAll:()=>[],addEventListener(){},createElement:tag=>({tagName:tag,value:'',textContent:'',innerHTML:'',click(){},style:{removeProperty(){}},classList:{add(){},remove(){}},parentElement:null,remove(){},appendChild(){},querySelectorAll:()=>[],getContext:()=>({})})};
global.window={matchMedia:()=>({matches:false,addEventListener(){}}),getComputedStyle:()=>({getPropertyValue:()=>''}),print(){}};
global.getComputedStyle=()=>({getPropertyValue:()=>''});global.Blob=class{};global.URL={createObjectURL:()=>'x',revokeObjectURL(){}};global.FileReader=class{readAsText(){}};global.setTimeout=fn=>{try{fn()}catch(e){}return 0};global.XLSX={utils:{aoa_to_sheet:()=>({}),book_new:()=>({}),book_append_sheet(){}},writeFile(){}};global.Chart=class{constructor(){}destroy(){}update(){}};
let app;
try{app=new Function(js+'\n; if(typeof boot==="function")boot(); return { state, _accessibleProject, _projectsUnderNode, _immediateChildNodes, computeNodeRollup, collectNodeDocs, renderOrgNavigator, setProjectRoleAccess, switchActiveProject, addProject, migrateToOrgTree, partitionProjectData, migrateAccessControl };')();}
catch(e){console.log('boot threw:',e.message);process.exit(1);}
let passed=0,failed=0;
function assert(l,c,d){if(c){passed++;console.log('  \u2713 '+l)}else{failed++;console.log('  \u2717 '+l+(d?' \u2014 '+d:''))}}
function assertEq(l,g,e){assert(l,g===e,`got ${JSON.stringify(g)}, expected ${JSON.stringify(e)}`)}
console.log('='.repeat(60));console.log(' ACCESS-SCOPED ROLLUPS — Phase D S4 (v1.16.0)');console.log('='.repeat(60));
delete app.state.org;app.migrateToOrgTree();app.partitionProjectData();app.migrateAccessControl();
const projB=app.addProject('pd-centre',{name:'Lahore Bypass'});
app.migrateAccessControl();
app.switchActiveProject('proj-f14f15');
app.state.commercial.ipcs.push({ipcNo:'N-IPC',gross:100});
projB.data.commercial.ipcs.push({ipcNo:'B-IPC',gross:50});
app.state.session=app.state.session||{};app.state.session.role='qs';

console.log('\nBaseline (qs has access to all):');
const allCount=app.computeNodeRollup('hq-nlc').totals.projectCount;
assertEq('root rollup sees both projects', allCount, 2);
assert('navigator lists projB', (app.renderOrgNavigator(),elements['orgNavHost'].innerHTML.includes('Lahore Bypass')));

console.log('\nRevoke qs access to projB:');
app.setProjectRoleAccess(projB.id,'qs',false);
assertEq('_accessibleProject(projB) false for qs', app._accessibleProject(projB), false);
assertEq('root rollup now excludes projB (count 1)', app.computeNodeRollup('hq-nlc').totals.projectCount, 1);
assert('_projectsUnderNode(hq-nlc) excludes projB', !app._projectsUnderNode('hq-nlc').some(p=>p.id===projB.id));
assert('cash/registers scoped: collectNodeDocs excludes projB IPC',
       !app.collectNodeDocs('hq-nlc','ipcs').some(e=>e.projectId===projB.id));
assert('still includes accessible project (F-14/F-15 IPC present)',
       app.collectNodeDocs('hq-nlc','ipcs').some(e=>e.projectId==='proj-f14f15'));
assertEq('_immediateChildNodes(pd-centre) excludes projB (now 0)', app._immediateChildNodes('pd-centre').length, 0);
app.renderOrgNavigator();
assert('navigator hides projB for qs', !elements['orgNavHost'].innerHTML.includes('Lahore Bypass'));

console.log('\nAdmin bypass:');
app.state.session.role='admin';
assertEq('admin sees projB again in rollup (count 2)', app.computeNodeRollup('hq-nlc').totals.projectCount, 2);
assert('_accessibleProject(projB) true for admin', app._accessibleProject(projB));
app.state.session.role='qs';

console.log('\nRestore:');
app.setProjectRoleAccess(projB.id,'qs',true);
assertEq('after restore, qs rollup sees both again', app.computeNodeRollup('hq-nlc').totals.projectCount, 2);

console.log('\n'+'='.repeat(60));
console.log(' ACCESS-SCOPED TEST RESULTS: '+passed+' passed, '+failed+' failed');
console.log('='.repeat(60));
process.exit(failed>0?1:0);
