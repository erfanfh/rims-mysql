import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {requireAdmin,fail,audit,execute,query,HttpError} from '@/lib/server';
import {RowDataPacket} from 'mysql2/promise';

const nameSpec = z.object({name: z.string().trim().min(2).max(180)});

export async function PUT(req: NextRequest, {params}: {params: {id: string}}) {
  try {
    const {user} = await requireAdmin(req);
    const id = params.id;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError('شناسه سازمان نامعتبر است.', 400);
    const b = nameSpec.parse(await req.json());
    const existing = await query<RowDataPacket[]>('SELECT id, name FROM organizations WHERE id=? LIMIT 1', [id]);
    if (!existing.length) throw new HttpError('سازمان پیدا نشد.', 404);
    if (existing[0].name === 'مدیریت پژوهش (سیستمی)') throw new HttpError('سازمان سیستمی قابل ویرایش نیست.', 403);
    await execute('UPDATE organizations SET name=? WHERE id=?', [b.name, id]);
    await audit(null, user.id, 'organization_updated', id, {old_name: existing[0].name, new_name: b.name});
    return NextResponse.json({id, name: b.name});
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({error: 'نام سازمان معتبر نیست.'}, {status: 400});
    return fail(e);
  }
}

export async function DELETE(req: NextRequest, {params}: {params: {id: string}}) {
  try {
    const {user} = await requireAdmin(req);
    const id = params.id;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError('شناسه سازمان نامعتبر است.', 400);
    const existing = await query<RowDataPacket[]>('SELECT id, name FROM organizations WHERE id=? LIMIT 1', [id]);
    if (!existing.length) throw new HttpError('سازمان پیدا نشد.', 404);
    if (existing[0].name === 'مدیریت پژوهش (سیستمی)') throw new HttpError('سازمان سیستمی قابل حذف نیست.', 403);

    // Check dependencies to preserve integrity
    const [profiles, invites, assessments] = await Promise.all([
      query<RowDataPacket[]>('SELECT COUNT(*) AS c FROM profiles WHERE organization_id=?', [id]),
      query<RowDataPacket[]>('SELECT COUNT(*) AS c FROM invites WHERE organization_id=?', [id]),
      query<RowDataPacket[]>('SELECT COUNT(*) AS c FROM assessments WHERE organization_id=?', [id])
    ]);
    if (Number(profiles[0]?.c) > 0 || Number(invites[0]?.c) > 0 || Number(assessments[0]?.c) > 0) {
      throw new HttpError('این سازمان دارای داده‌های مرتبط (کاربران، کدهای دعوت یا ارزیابی‌ها) است و قابل حذف نیست. ابتدا موارد مرتبط را مدیریت کنید.', 409);
    }

    await execute('DELETE FROM organizations WHERE id=?', [id]);
    await audit(null, user.id, 'organization_deleted', id, {name: existing[0].name});
    return NextResponse.json({ok: true});
  } catch (e) {
    return fail(e);
  }
}
