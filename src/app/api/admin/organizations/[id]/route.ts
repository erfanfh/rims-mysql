import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {requireAdmin,fail,audit,execute,query,HttpError} from '@/lib/server';
import {RowDataPacket} from 'mysql2/promise';

const updateSpec = z.object({
  name: z.string().trim().min(2).max(180).optional(),
  activityType: z.string().trim().min(2).max(100).optional(),
  sector: z.string().trim().min(2).max(160).optional(),
}).refine(data => data.name || data.activityType || data.sector, {
  message: 'حداقل یک فیلد برای ویرایش لازم است.'
});

export async function PUT(req: NextRequest, {params}: {params: {id: string}}) {
  try {
    const {user} = await requireAdmin(req);
    const id = params.id;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError('شناسه سازمان نامعتبر است.', 400);
    const b = updateSpec.parse(await req.json());
    const existing = await query<RowDataPacket[]>('SELECT id, name, activity_type, construction_sector FROM organizations WHERE id=? LIMIT 1', [id]);
    if (!existing.length) throw new HttpError('سازمان پیدا نشد.', 404);
    if (existing[0].name === 'مدیریت پژوهش (سیستمی)') throw new HttpError('سازمان سیستمی قابل ویرایش نیست.', 403);

    const sets: string[] = [];
    const values: unknown[] = [];
    if (b.name !== undefined) {
      sets.push('name=?');
      values.push(b.name);
    }
    if (b.activityType !== undefined) {
      sets.push('activity_type=?');
      values.push(b.activityType);
    }
    if (b.sector !== undefined) {
      sets.push('construction_sector=?');
      values.push(b.sector);
    }
    values.push(id);

    await execute(`UPDATE organizations SET ${sets.join(', ')} WHERE id=?`, values);
    await audit(null, user.id, 'organization_updated', id, {
      old: {name: existing[0].name, activity_type: existing[0].activity_type, construction_sector: existing[0].construction_sector},
      new: {name: b.name ?? existing[0].name, activity_type: b.activityType ?? existing[0].activity_type, construction_sector: b.sector ?? existing[0].construction_sector}
    });
    return NextResponse.json({
      id,
      name: b.name ?? existing[0].name,
      activity_type: b.activityType ?? existing[0].activity_type,
      construction_sector: b.sector ?? existing[0].construction_sector
    });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({error: 'مشخصات سازمان معتبر نیست.'}, {status: 400});
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

    // Only assessments and invites block deletion. Related profiles are deleted via ON DELETE CASCADE.
    const [invites, assessments] = await Promise.all([
      query<RowDataPacket[]>('SELECT COUNT(*) AS c FROM invites WHERE organization_id=?', [id]),
      query<RowDataPacket[]>('SELECT COUNT(*) AS c FROM assessments WHERE organization_id=?', [id])
    ]);
    if (Number(invites[0]?.c) > 0 || Number(assessments[0]?.c) > 0) {
      throw new HttpError('این سازمان دارای کدهای دعوت یا ارزیابی‌های مرتبط است و قابل حذف نیست. ابتدا موارد مرتبط را مدیریت کنید.', 409);
    }

    await execute('DELETE FROM organizations WHERE id=?', [id]);
    await audit(null, user.id, 'organization_deleted', id, {name: existing[0].name});
    return NextResponse.json({ok: true});
  } catch (e) {
    return fail(e);
  }
}
