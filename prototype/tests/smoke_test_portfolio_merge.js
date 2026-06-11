/* SMOKE TEST — Portfolio merged into command (Phase D S5, v1.17.0) */
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
try{app=new Function(js+'\n; if(typeof boot==="function")boot(); return { state, renderSubtreeProjectsHtml, computeNodeRollup, renderCommandCenter, setProjectRoleAccess, switchActiveProject, addProject, switchModule, migrateToOrgTree, partitionProjectData, migrateAccessControl };')();}
catch(e){console.log('boot threw:',e.message);process.exit(1);}
let passed=0,failed=0;
function assert(l,c,d){if(c){passed++;console.log('  \u2713 '+l)}else{failed++;console.log('  \u2717 '+l+(d?' \u2014 '+d:''))}}
function assertEq(l,g,e){assert(l,g===e,`got ${JSON.stringify(g)}, expected ${JSON.stringify(e)}`)}
console.log('='.repeat(60));console.log(' PORTFOLIO MERGE — Phase D S5 (v1.17.0)');console.log('='.repeat(60));
delete app.state.org;app.migrateToOrgTree();app.partitionProjectData();app.migrateAccessControl();
const projB=app.addProject('pd-centre',{name:'Lahore Bypass'});app.migrateAccessControl();
app.state.session=app.state.session||{};app.state.session.role='qs';
app.switchActiveProject('proj-f14f15');

console.log('\nGroup 1 — flat list content + scoping');
assert('renderSubtreeProjectsHtml callable', typeof app.renderSubtreeProjectsHtml==='function');
let html=app.renderSubtreeProjectsHtml('hq-nlc');
assert('flat list lists all subtree projects', html.includes('F-14/15 Islamabad') && html.includes('Lahore Bypass'));
assert('flat list rows are clickable (setActiveNode)', html.includes('setActiveNode('));
assert('flat list shows PD HQ column values', html.includes('HQ PD North') && html.includes('HQ PD Centre'));
assert('header reflects 2 projects', html.includes('subtree \u2014 2'));
app.setProjectRoleAccess(projB.id,'qs',false);
html=app.renderSubtreeProjectsHtml('hq-nlc');
assert('ACCESS-SCOPED: flat list excludes revoked project', !html.includes('Lahore Bypass'));
assert('still lists accessible project', html.includes('F-14/15 Islamabad'));
app.setProjectRoleAccess(projB.id,'qs',true);

console.log('\nGroup 2 — command-center integration + retirement');
app.state.org.activeNodeId='hq-nlc';app.switchModule('command');
const host=elements['commandHost'].innerHTML;
assert('command center includes flat all-projects section', host.includes('cmd-allproj') && host.includes('All projects in subtree'));
assert('Portfolio nav button removed from app HTML', !src.includes('data-module="portfolio"'));
assert('Command nav button still present', src.includes('data-module="command"'));

console.log('\n'+'='.repeat(60));
console.log(' PORTFOLIO MERGE TEST RESULTS: '+passed+' passed, '+failed+' failed');
console.log('='.repeat(60));
process.exit(failed>0?1:0);
