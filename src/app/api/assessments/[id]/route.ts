import {NextRequest,NextResponse} from 'next/server';
import {requireProfile,fail,HttpError,noStore,query,transaction,txQuery,txExecute} from '@/lib/server';
import {z} from 'zod';
import {RowDataPacket} from 'mysql2/promise';
export async function GET(req:NextRequest,{params}:{params:{id:string}}){try{
 const {user,profile}=await requireProfile(req);const records=await query<RowDataPacket[]>('SELECT * FROM assessments WHERE id=? LIMIT 1',[params.id]);const a=records[0];
 if(!a)throw new HttpError('ارزیابی پیدا نشد.',404);if(a.respondent_id!==user.id&&profile.role!=='admin')throw new HttpError('دسترسی غیرمجاز.',403);
 const [answers,dimensions,results,feedback]=await Promise.all([
  query<RowDataPacket[]>('SELECT question_id,selected_index,updated_at FROM answers WHERE assessment_id=?',[params.id]),
  query<RowDataPacket[]>('SELECT dimension_key,average_score,weighted_score,item_count FROM dimension_scores WHERE assessment_id=?',[params.id]),
  query<RowDataPacket[]>('SELECT total_score,tier,scoring_rules_id,algorithm_version,calculated_at FROM maturity_results WHERE assessment_id=? LIMIT 1',[params.id]),
  query<RowDataPacket[]>('SELECT question_id,reason FROM target_feedback WHERE assessment_id=?',[params.id])
 ]);
 return NextResponse.json({assessment:a,answers,dimensions,targetFeedback:Object.fromEntries(feedback.map(r=>[r.question_id,r.reason])),result:results[0]??null},{headers:noStore});
}catch(e){return fail(e);}}

const feedbackSpec=z.object({questionId:z.string().regex(/^target-[1-5]$/),reason:z.string().max(5000).trim()});
export async function PATCH(req:NextRequest,{params}:{params:{id:string}}){try{
 const {user}=await requireProfile(req);
 const {questionId,reason}=feedbackSpec.parse(await req.json());
 await transaction(async conn=>{
  const rows=await txQuery<RowDataPacket[]>(conn,'SELECT respondent_id,status,questionnaire_version FROM assessments WHERE id=? FOR UPDATE',[params.id]);
  const a=rows[0];
  if(!a||a.respondent_id!==user.id||a.status!=='draft')throw new HttpError('دسترسی به ویرایش توضیحات امکان‌پذیر نیست.',403);
  const questions=await txQuery<RowDataPacket[]>(conn,"SELECT id FROM questions WHERE id=? AND questionnaire_version=? AND kind='target'",[questionId,a.questionnaire_version]);
  if(!questions.length)throw new HttpError('سؤال هدف معتبر نیست.',400);
  if(reason){
   await txExecute(conn,'INSERT INTO target_feedback (assessment_id,question_id,reason) VALUES (?,?,?) ON DUPLICATE KEY UPDATE reason=VALUES(reason),updated_at=CURRENT_TIMESTAMP(3)',[params.id,questionId,reason]);
  }else{
   await txExecute(conn,'DELETE FROM target_feedback WHERE assessment_id=? AND question_id=?',[params.id,questionId]);
  }
 });
 return NextResponse.json({saved:true,reason});
}catch(e){if(e instanceof z.ZodError)return NextResponse.json({error:'توضیحات نامعتبر است (حداکثر ۵۰۰۰ نویسه).'}, {status:400});return fail(e);}}
