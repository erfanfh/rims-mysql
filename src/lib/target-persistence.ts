import {PoolConnection,RowDataPacket} from 'mysql2/promise';
import {HttpError,txQuery,txExecute} from './server';

/** Caller must hold the assessment row lock in a transaction. */
export async function persistCeiling(conn:PoolConnection,assessmentId:string,version:string,targetId:string){
    const catalog=await txQuery<RowDataPacket[]>(conn,'SELECT q.text AS question_text,o.label,o.text AS option_text FROM questions q JOIN answer_options o ON o.question_id=q.id AND o.option_index=4 WHERE q.id=? AND q.questionnaire_version=?',[targetId,version]);
    if(!catalog[0])throw new HttpError('گزینه سقف بلوغ معتبر نیست.',400);
    const c=catalog[0];
    await txExecute(conn,'INSERT INTO answers (assessment_id,question_id,selected_index,question_text_snapshot,option_label_snapshot,option_text_snapshot,updated_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE selected_index=VALUES(selected_index),question_text_snapshot=VALUES(question_text_snapshot),option_label_snapshot=VALUES(option_label_snapshot),option_text_snapshot=VALUES(option_text_snapshot),updated_at=CURRENT_TIMESTAMP(3)',[assessmentId,targetId,4,c.question_text,c.label,c.option_text]);
}
