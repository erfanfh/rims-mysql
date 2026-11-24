import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateScores,DIMENSIONS,getTier,validateThresholds} from '../src/lib/scoring';
const answers=Object.fromEntries(DIMENSIONS.flatMap(d=>d.questionIds.map(q=>[q,3])));
test('catalog: 35 attributes, 5 dimensions, weights total 1',()=>{
 assert.equal(DIMENSIONS.reduce((n,d)=>n+d.questionIds.length,0),35);
 assert.equal(DIMENSIONS.reduce((n,d)=>n+d.weight,0),1);
});
test('all 3s yield exactly 3, baseline ignored',()=>{assert.equal(calculateScores({...answers,q1:5,q2:1}).total,3);});
test('test vector yields 3.135 (using per-dimension uniform scores for synthetic vector)',()=>{
 const arrs=[[3,4,2,3,4,5],[3,3,3,3,3,3,3],[4,4,4,4,4,4,4],[2,2,2,2,2,2,2],[2,3,2,3,2,3,2,3]];
 const example=Object.fromEntries(DIMENSIONS.flatMap((d,i)=>d.questionIds.map((id,j)=>[id,arrs[i][j]])));
 assert.ok(Math.abs(calculateScores(example).total-3.135)<1e-10);
});
test('1 and 5 boundaries',()=>{
 assert.equal(calculateScores(Object.fromEntries(Object.keys(answers).map(k=>[k,1]))).total,1);
 assert.equal(calculateScores(Object.fromEntries(Object.keys(answers).map(k=>[k,5]))).total,5);
});
test('incomplete questionnaire cannot be scored',()=>{assert.throws(()=>calculateScores({...answers,q3:undefined as unknown as number}));});
test('tier disabled without sourced rules',()=>{assert.equal(getTier(3.5,[]),null);});
test('approved tier gaps rejected',()=>{
 assert.equal(validateThresholds([{tier:'Tier 1',min:1,max:2},{tier:'Tier 2',min:2,max:3},{tier:'Tier 3',min:3,max:4},{tier:'Tier 4',min:4,max:4.5},{tier:'Tier 5',min:4.6,max:5}]),false);
});

import {availableTargetIndices,targetState,validTarget,reconcileTargets,dimensionAverage,scoresFromIndices,TARGET_DIMENSIONS} from '../src/lib/scoring';
const indicesFor=(ids:readonly string[],values:number[])=>Object.fromEntries(ids.map((id,i)=>[id,values[i]-1]));
for(const [mean,values,levels] of [
 [1,[1,1,1,1,1,1,1,1],[2,3,4,5]],
 [1.5,[1,2,1,2,1,2,1,2],[2,3,4,5]],
 [2,[2,2,2,2,2,2,2,2],[3,4,5]],
 [2.5,[2,3,2,3,2,3,2,3],[3,4,5]],
 [3,[3,3,3,3,3,3,3,3],[4,5]],
 [3.75,[3,4,4,4,3,4,4,4],[4,5]],
 [4,[4,4,4,4,4,4,4,4],[5]],
 [4.875,[4,5,5,5,5,5,5,5],[5]],
 [5,[5,5,5,5,5,5,5,5],[]]
] as [number,number[],number[]][]){
 test(`target boundaries: ${mean}`,()=>{
  const indices=indicesFor(DIMENSIONS[4].questionIds,values);
  const state=targetState('target-5',indices);
  assert.equal(state.average,mean);assert.deepEqual(state.available.map(i=>i+1),levels);
  assert.equal(state.ceiling,mean===5);
  for(let i=0;i<5;i++)assert.equal(validTarget('target-5',indices,i),levels.includes(i+1)||(mean===5&&i===4));
 });
}
test('all five dimensions independent; general answers ignored',()=>{
 const indices=Object.fromEntries(DIMENSIONS.flatMap((d,i)=>d.questionIds.map(id=>[id,i])));
 for(const [i,t] of TARGET_DIMENSIONS.entries())assert.equal(targetState(t.targetId,{...indices,q1:4,q2:4}).average,i+1);
});
test('incomplete or invalid dimension cannot select a target',()=>{
 for(const {dimension,targetId} of TARGET_DIMENSIONS){
  const indices=indicesFor(dimension.questionIds,dimension.questionIds.map(()=>3));
  delete indices[dimension.questionIds[0]];
  assert.equal(targetState(targetId,indices).average,null);assert.equal(validTarget(targetId,indices,4),false);
  indices[dimension.questionIds[0]]=5;assert.equal(targetState(targetId,indices).average,null);
 }
});
test('editing invalidates old target, keeps other valid target, persists ceiling in normalized draft',()=>{
 const first=DIMENSIONS[0].questionIds,second=DIMENSIONS[1].questionIds;
 const original={...indicesFor(first,[2,3,2,3,2,3]),...indicesFor(second,[2,2,2,2,2,2,2]),'target-1':2,'target-2':3};
 assert.deepEqual(reconcileTargets(original),original);
 const edited=reconcileTargets({...original,[first[0]]:4});
 assert.equal(edited['target-1'],undefined);assert.equal(edited['target-2'],3);
 const ceiling=reconcileTargets({...edited,...indicesFor(first,[5,5,5,5,5,5])});
 assert.equal(ceiling['target-1'],4);assert.equal(targetState('target-1',ceiling).average,5);
 assert.equal(reconcileTargets({...ceiling,[first[0]]:3})['target-1'],4);
});
test('raw fraction used for comparison, scoring source shared',()=>{
 const indices=indicesFor(DIMENSIONS[1].questionIds,[3,3,3,3,3,3,2]);
 assert.equal(targetState('target-2',indices).average,20/7);
 assert.equal(dimensionAverage(DIMENSIONS[1].questionIds,scoresFromIndices(indices)),20/7);
 assert.equal(validTarget('target-2',indices,2),true);
});

test('synthetic 4.20 and 4.80 boundaries (not exact attainable means for this catalog)',()=>{
 assert.deepEqual(availableTargetIndices(4.2),[4]);
 assert.deepEqual(availableTargetIndices(4.8),[4]);
});
