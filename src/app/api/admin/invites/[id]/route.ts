import {NextRequest,NextResponse} from 'next/server';
import {requireAdmin,fail,audit,execute,query,HttpError} from '@/lib/server';
import {RowDataPacket} from 'mysql2/promise';

export async function DELETE(req: NextRequest, {params}: {params: {id: string}}) {
  try {
    const {user} = await requireAdmin(req);
    const id = params.id;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError('شناسه کد دعوت نامعتبر است.', 400);
    const existing = await query<RowDataPacket[]>('SELECT id, used_by FROM invites WHERE id=? LIMIT 1', [id]);
    if (!existing.length) throw new HttpError('کد دعوت پیدا نشد.', 404);
    // Deleting removes the code; used_by FK is SET NULL so user remains
    await execute('DELETE FROM invites WHERE id=?', [id]);
    await audit(null, user.id, 'invite_deleted', id, {was_used: !!existing[0].used_by});
    return NextResponse.json({ok: true});
  } catch (e) {
    return fail(e);
  }
}
