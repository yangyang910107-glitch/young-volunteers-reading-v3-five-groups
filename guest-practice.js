// Each guest owns a separate set of groups. None is registered in the class.
function createGuestPractice({STAGES,CAPS,GROUP_QUESTIONS,blankKeys,blankMarks,bridgeDrafts,closeDrafts}) {
  return function guestRoom(source, guest) {
    let room = guest.practiceRoom;
    if (!room || room.round !== source.round) {
      guest.notes = '';
      guest.notesRevision = 0;
      guest.exit = null;
      room = guest.practiceRoom = {
        guestPractice:true, owner:guest, source,
        code:source.code, id:source.id, round:source.round, step:source.step,
        keysAttempt:source.keysAttempt||0,bridgeAttempt:source.bridgeAttempt||0,expectedStudents:0, students:new Map([[guest.id,guest]]), observers:new Map(),
        groups:CAPS.map((capacity,i)=>({
          id:i+1,q:GROUP_QUESTIONS[i][0],qs:GROUP_QUESTIONS[i],capacity,markings:blankMarks(),
          drafts:{keys:blankKeys(),combined:bridgeDrafts(GROUP_QUESTIONS[i]),peer:[]},
          submissions:{},feedback:null,target:null
        }))
      };
    }
    if (room.step !== source.step) {
      if(STAGES[room.step]!=='peer')closeDrafts(room, STAGES[room.step]);
      room.step = source.step;
    }
    if(room.keysAttempt!==(source.keysAttempt||0)){room.keysAttempt=source.keysAttempt||0;room.groups.forEach(g=>{if(g.submissions.keys)g.drafts.keys=structuredClone(g.submissions.keys);delete g.submissions.keys;delete g.closedDrafts?.keys;});}
    if(room.bridgeAttempt!==(source.bridgeAttempt||0)){room.bridgeAttempt=source.bridgeAttempt||0;room.groups.forEach(g=>{if(g.submissions.combined)g.drafts.combined=structuredClone(g.submissions.combined);delete g.submissions.combined;delete g.submissions.peer;delete g.closedDrafts?.combined;delete g.closedDrafts?.peer;g.drafts.peer=[];g.feedback=null;g.target=null;});}
    room.revealed = {...source.revealed};
    room.demo = source.demo;
    if (STAGES[room.step] === 'peer') {
      for (const group of room.groups) {
        if (!group.target) {
          group.target = source.groups[group.id-1].target || group.id % CAPS.length + 1;
          group.drafts.peer = [];
        }
      }
    }
    return room;
  };
}
module.exports = {createGuestPractice};
