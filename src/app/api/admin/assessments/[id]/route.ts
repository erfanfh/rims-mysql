import {NextRequest,NextResponse} from 'next/server';
import {requireAdmin,fail,audit,query,HttpError,transaction,txExecute,txQuery} from '@/lib/server';
import {RowDataPacket} from 'mysql2/promise';

export async function DELETE(req: NextRequest, {params}: {params: {id: string}}) {
  try {
    const {user} = await requireAdmin(req);
    const id = params.id;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError('شناسه ارزیابی نامعتبر است.', 400);

    const existing = await query<RowDataPacket[]>('SELECT id, status, respondent_id, organization_id FROM assessments WHERE id=? LIMIT 1', [id]);
    if (!existing.length) throw new HttpError('رکورد ارزیابی پیدا نشد.', 404);

    // Delete related records first to satisfy FKs, then the assessment.
    // Does not touch profiles, invites, or other independent data.
    await transaction(async (conn) => {
      await txExecute(conn, 'DELETE FROM answers WHERE assessment_id=?', [id]);
      await txExecute(conn, 'DELETE FROM dimension_scores WHERE assessment_id=?', [id]);
      await txExecute(conn, 'DELETE FROM maturity_results WHERE assessment_id=?', [id]);
      const res = await txExecute(conn, 'DELETE FROM assessments WHERE id=?', [id]);
      if (res.affectedRows === 0) throw new HttpError('حذف ارزیابی انجام نشد.', 500);
    });

    await audit(null, user.id, 'assessment_deleted', id, {
      status: existing[0].status,
      respondent_id: existing[0].respondent_id,
      organization_id: existing[0].organization_id
    });
    return NextResponse.json({ok: true});
  } catch (e) {
    return fail(e);
  }
}
