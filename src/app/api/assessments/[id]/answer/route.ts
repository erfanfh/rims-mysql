import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {requireProfile,fail,HttpError,transaction,txQuery,txExecute} from '@/lib/server';
import {TARGET_DIMENSIONS,reconcileTargets,targetState} from '@/lib/scoring';
import {persistCeiling} from '@/lib/target-persistence';
import {RowDataPacket} from 'mysql2/promise';
const spec=z.object({questionId:z.string().regex(/^(q([1-9]|[12][0-9]|3[0-7])|target-[1-5])$/),optionIndex:z.number().int().min(0).max(4)});
export async function PATCH(req:NextRequest,{params}:{params:{id:string}}){try{
 const {user}=await requireProfile(req);const {questionId,optionIndex}=spec.parse(await req.json());
 const savedAnswers=await transaction(async conn=>{
  const rows=await txQuery<RowDataPacket[]>(conn,'SELECT id,respondent_id,status,questionnaire_version FROM assessments WHERE id=? FOR UPDATE',[params.id]);const a=rows[0];
  if(!a||a.respondent_id!==user.id||a.status!=='draft')throw new HttpError('دسترسی به ویرایش پاسخ امکان‌پذیر نیست.',403);
  const questions=await txQuery<RowDataPacket[]>(conn,'SELECT text,questionnaire_version FROM questions WHERE id=? LIMIT 1',[questionId]);const q=questions[0];
  const options=await txQuery<RowDataPacket[]>(conn,'SELECT label,text FROM answer_options WHERE question_id=? AND option_index=? LIMIT 1',[questionId,optionIndex]);const o=options[0];
  if(!q||q.questionnaire_version!==a.questionnaire_version||!o)throw new HttpError('گزینه سؤال معتبر نیست.',400);
  const stored=await txQuery<RowDataPacket[]>(conn,'SELECT question_id,selected_index FROM answers WHERE assessment_id=?',[params.id]);
  const indices:Record<string,number>=Object.fromEntries(stored.map(r=>[r.question_id,Number(r.selected_index)]));
  if(TARGET_DIMENSIONS.some(t=>t.targetId===questionId)&&!targetState(questionId,indices).available.includes(optionIndex))throw new HttpError('سطح هدف باید بالاتر از بلوغ فعلی رکن باشد و تمام سؤالات آن پاسخ داده شده باشند.',400);
  await txExecute(conn,'INSERT INTO answers (assessment_id,question_id,selected_index,question_text_snapshot,option_label_snapshot,option_text_snapshot,updated_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE selected_index=VALUES(selected_index),question_text_snapshot=VALUES(question_text_snapshot),option_label_snapshot=VALUES(option_label_snapshot),option_text_snapshot=VALUES(option_text_snapshot),updated_at=CURRENT_TIMESTAMP(3)',[params.id,questionId,optionIndex,q.text,o.label,o.text]);
  indices[questionId]=optionIndex;
  const reconciled=reconcileTargets(indices);
  for(const {targetId} of TARGET_DIMENSIONS){
   if(reconciled[targetId]===undefined&&indices[targetId]!==undefined){
    await txExecute(conn,'DELETE FROM answers WHERE assessment_id=? AND question_id=?',[params.id,targetId]);
   }else if(reconciled[targetId]===4&&indices[targetId]!==4){
    await persistCeiling(conn,params.id,a.questionnaire_version,targetId);
   }
  }
  return reconciled;
 });
 return NextResponse.json({saved:true,answers:savedAnswers});
}catch(e){if(e instanceof z.ZodError)return NextResponse.json({error:'پاسخ نامعتبر.'},{status:400});return fail(e);}}
