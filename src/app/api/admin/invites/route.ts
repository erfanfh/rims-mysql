import {NextRequest,NextResponse} from 'next/server';
import {randomBytes,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {requireAdmin,fail,HttpError,shaCode,audit,query,execute,noStore} from '@/lib/server';
import {RowDataPacket} from 'mysql2/promise';

const spec=z.object({organizationId:z.string().uuid(),days:z.number().int().min(1).max(90).default(14)});

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const rows = await query<RowDataPacket[]>(`
      SELECT i.id, i.organization_id, i.created_at, i.expires_at, i.used_at, i.used_by,
             o.name AS organization_name,
             p.full_name AS used_by_name, p.job_title AS used_by_title
      FROM invites i
      LEFT JOIN organizations o ON o.id = i.organization_id
      LEFT JOIN profiles p ON p.id = i.used_by
      ORDER BY i.created_at DESC
      LIMIT 500
    `);
    const list = rows.map(r => ({
      id: r.id,
      organization_id: r.organization_id,
      organization_name: r.organization_name || 'سازمان نامشخص',
      created_at: r.created_at,
      expires_at: r.expires_at,
      used_at: r.used_at,
      used: !!r.used_by || !!r.used_at,
      used_by: r.used_by,
      used_by_name: r.used_by_name || null,
      used_by_title: r.used_by_title || null,
      expired: r.expires_at && new Date(r.expires_at) < new Date()
    }));
    return NextResponse.json({invites: list}, {headers: noStore});
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req:NextRequest){try{
 const {user}=await requireAdmin(req);const b=spec.parse(await req.json());const orgRows=await query<RowDataPacket[]>('SELECT id,name FROM organizations WHERE id=? LIMIT 1',[b.organizationId]);const org=orgRows[0];if(!org)throw new HttpError('سازمان پیدا نشد.',404);
 const inviteCode=randomBytes(18).toString('base64url');const expires=new Date(Date.now()+b.days*86400000);const id=randomUUID();
 await execute('INSERT INTO invites (id,code_hash,organization_id,created_by,expires_at) VALUES (?,?,?,?,?)',[id,shaCode(inviteCode),b.organizationId,user.id,expires]);
 await audit(null,user.id,'invite_created',id,{organization_id:org.id,expires_at:expires.toISOString()});
 return NextResponse.json({code:inviteCode,organization:org.name,expiresAt:expires.toISOString()},{status:201,headers:{'Cache-Control':'no-store'}});
}catch(e){if(e instanceof z.ZodError)return NextResponse.json({error:'اطلاعات کد دعوت نامعتبر است.'},{status:400});return fail(e);}}
