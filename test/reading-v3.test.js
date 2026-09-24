const {test}=require('node:test');
const assert=require('node:assert/strict');
const {io}=require('socket.io-client');
const {createApp}=require('../server');
const {WHO_ANSWERS,EVIDENCE}=require('../curriculum');

test('five-group lesson keeps all six bridge questions and uses a five-group peer ring',async t=>{
 const app=createApp(),clients=[];
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{clients.forEach(c=>c.disconnect());await new Promise(resolve=>app.io.close(resolve));});
 const connect=async()=>{const c=io('http://127.0.0.1:'+app.server.address().port,{transports:['websocket'],forceNew:true});clients.push(c);await new Promise(resolve=>c.once('connect',resolve));return c;};
 const send=(c,event,payload={})=>new Promise((resolve,reject)=>c.timeout(3000).emit(event,payload,(err,result)=>err?reject(err):result.ok?resolve(result):reject(Error(result.error))));
 const teacher=await connect(),joined=await send(teacher,'teacher:join',{code:'FIVEGROUPS',expected:5}),auth={code:'FIVEGROUPS',token:joined.token};
 let state=joined.state;
 assert.equal(state.version,'volunteers-reading-v3-five-groups');
 assert.equal(state.groups.length,5);
 assert.deepEqual(state.groups.map(g=>g.qs),[[0],[1],[2],[3],[4,5]]);
 const students=[],identities=[];
 for(let i=0;i<5;i++){const c=await connect(),identity={code:'FIVEGROUPS',group:i+1,name:'Team '+(i+1),clientId:'five-group-team-'+(i+1)};students.push(c);identities.push(identity);await send(c,'student:join',identity);}
 await assert.rejects(send(await connect(),'student:join',{code:'FIVEGROUPS',group:6,name:'Extra',clientId:'five-group-extra'}),/1–5/);
 await send(teacher,'teacher:start',auth);
 const refresh=async()=>state=(await send(teacher,'teacher:join',auth)).state;
 const next=async()=>{await send(teacher,'teacher:next',{...auth,stage:state.stage,round:state.round});await refresh();};
 await refresh();
 await next();
 await next();
 await next();
 await next();
 assert.equal(state.stage,'combined');
 for(let groupIndex=0;groupIndex<5;groupIndex++){
  const qs=groupIndex===4?[4,5]:[groupIndex];
  for(const q of qs){
   await send(students[groupIndex],'group:draft',{stage:'combined',round:state.round,q,field:'who',value:WHO_ANSWERS[q]});
   for(const value of EVIDENCE[q])await send(students[groupIndex],'group:draft',{stage:'combined',round:state.round,q,field:'evidence',value});
  }
  await send(students[groupIndex],'group:submit',{stage:'combined',round:state.round});
 }
 await refresh();
 assert.equal(state.submitted,5);
 await next();
 assert.equal(state.stage,'peer');
 for(let i=0;i<5;i++){
  const personal=(await send(students[i],'student:join',identities[i])).personal;
  assert.equal(personal.target.group,(i+1)%5+1);
  assert.equal(personal.target.tasks.length,personal.target.group===5?2:1);
  await send(students[i],'group:feedback',{stage:'peer',round:state.round,status:'approved',note:''});
 }
 await send(teacher,'teacher:reveal',{...auth,stage:'peer',round:state.round});
 await refresh();
 assert.equal(state.accuracy.length,6);
 assert.ok(state.accuracy.every(row=>row.total===1&&row.correct===1));
 assert.ok(state.scoreboard.find(row=>row.group===5).phases.combined>=30);
 assert.equal(state.scoreboard.find(row=>row.group===4).phases.peer,5);
 const record=(await send(teacher,'teacher:record',auth)).record;
 assert.equal(record.groups.length,5);
 assert.deepEqual(record.groups[4].qs,[4,5]);
 assert.equal(record.groups[4].initial.length,2);
 assert.deepEqual(record.groups[4].initialCorrect,[true,true]);
});

test('fixed room restores a returning group and can be reclaimed after the teacher closes it',async t=>{
 const app=createApp(),clients=[];
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{clients.forEach(c=>c.disconnect());await new Promise(resolve=>app.io.close(resolve));});
 const connect=async()=>{const c=io('http://127.0.0.1:'+app.server.address().port,{transports:['websocket'],forceNew:true});clients.push(c);await new Promise(resolve=>c.once('connect',resolve));return c;};
 const send=(c,event,payload={})=>new Promise((resolve,reject)=>c.timeout(3000).emit(event,payload,(err,result)=>err?reject(err):result.ok?resolve(result):reject(Error(result.error))));
 const teacher=await connect(),opened=await send(teacher,'teacher:join',{code:'VOL5G',expected:5});
 const firstStudent=await connect();
 await send(firstStudent,'student:join',{code:'VOL5G',group:2,name:'Recovery Team',clientId:'original-recovery-client'});
 firstStudent.disconnect();
 await new Promise(resolve=>setTimeout(resolve,30));
 const returningStudent=await connect(),restored=await send(returningStudent,'student:join',{code:'VOL5G',group:2,name:'Recovery Team',clientId:'new-recovery-client'});
 assert.equal(restored.resumed,true);
 assert.equal(restored.group,2);
 teacher.disconnect();
 await new Promise(resolve=>setTimeout(resolve,30));
 const replacementTeacher=await connect(),reclaimed=await send(replacementTeacher,'teacher:join',{code:'VOL5G',expected:5});
 assert.notEqual(reclaimed.token,opened.token);
 assert.equal(reclaimed.state.joined,1);
 await assert.rejects(send(await connect(),'teacher:join',{code:'VOL5G',expected:5}),/in use/i);
});
