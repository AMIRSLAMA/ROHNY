import { BadRequestException, Body, Controller, ForbiddenException, Get, Patch, Post, Req, UseGuards, Param } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthTokenGuard, AuthenticatedRequest } from '../auth/auth-token.guard';
import { UserRole } from '../users/entities/user.entity';

@Controller('wallet/deposits')
@UseGuards(AuthTokenGuard)
export class WalletDepositController {
  constructor(private readonly db: DataSource) {}

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() body: { amount?: unknown; currency?: unknown; note?: unknown }) {
    const user = req.authUser!;
    if (user.role !== UserRole.RIDER) throw new ForbiddenException('Only riders can request wallet deposits');
    const currency = String(body.currency || 'EGP').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestException('رمز العملة غير صحيح');
    let digits: number;
    try { digits = new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2; }
    catch { throw new BadRequestException('العملة غير مدعومة'); }
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) throw new BadRequestException('أدخل مبلغًا صحيحًا');
    const minor = Math.round(amount * (10 ** digits));
    if (!Number.isSafeInteger(minor) || minor <= 0) throw new BadRequestException('المبلغ غير صالح');
    const note = String(body.note || '').trim().slice(0, 240);
    const rows = await this.db.query(
      `INSERT INTO wallet_deposit_requests (rider_user_id, amount_minor, currency, rider_note, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id, amount_minor, currency, rider_note, status, created_at`,
      [user.sub, String(minor), currency, note || null],
    );
    const row = rows[0];
    return { id: row.id, amount: (Number(row.amount_minor) / (10 ** digits)).toFixed(digits), currency: row.currency, note: row.rider_note, status: row.status, createdAt: row.created_at };
  }

  @Get('mine')
  async mine(@Req() req: AuthenticatedRequest) {
    const user = req.authUser!;
    if (user.role !== UserRole.RIDER) throw new ForbiddenException('Only riders can view their deposit requests');
    const rows = await this.db.query(
      `SELECT id, amount_minor, currency, rider_note, status, admin_note, created_at, reviewed_at
       FROM wallet_deposit_requests WHERE rider_user_id = $1 ORDER BY created_at DESC LIMIT 50`, [user.sub]);
    return rows.map((row: any) => {
      const digits = new Intl.NumberFormat('en-US', { style: 'currency', currency: row.currency }).resolvedOptions().maximumFractionDigits ?? 2;
      return { id: row.id, amount: (Number(row.amount_minor) / (10 ** digits)).toFixed(digits), currency: row.currency, note: row.rider_note, status: row.status, adminNote: row.admin_note, createdAt: row.created_at, reviewedAt: row.reviewed_at };
    });
  }

  @Get('admin')
  async adminList(@Req() req: AuthenticatedRequest) {
    if (req.authUser!.role !== UserRole.ADMIN) throw new ForbiddenException('Admin access required');
    const rows = await this.db.query(
      `SELECT d.id, d.rider_user_id, u.email, u.phone, d.amount_minor, d.currency, d.rider_note, d.status, d.admin_note, d.created_at
       FROM wallet_deposit_requests d JOIN users u ON u.id = d.rider_user_id
       ORDER BY CASE WHEN d.status = 'pending' THEN 0 ELSE 1 END, d.created_at DESC LIMIT 200`);
    return rows.map((row: any) => {
      const digits = new Intl.NumberFormat('en-US', { style: 'currency', currency: row.currency }).resolvedOptions().maximumFractionDigits ?? 2;
      return { id: row.id, riderUserId: row.rider_user_id, rider: row.email || row.phone || row.rider_user_id, amount: (Number(row.amount_minor) / (10 ** digits)).toFixed(digits), currency: row.currency, note: row.rider_note, status: row.status, adminNote: row.admin_note, createdAt: row.created_at };
    });
  }

  @Patch(':id/review')
  async review(@Req() req: AuthenticatedRequest, @Body() body: { decision?: unknown; note?: unknown }, @Param('id') id: string) {
    const adminId = req.authUser!.sub;
    if (req.authUser!.role !== UserRole.ADMIN) throw new ForbiddenException('Admin access required');
    const decision = String(body.decision || '');
    if (!['approved', 'rejected'].includes(decision)) throw new BadRequestException('اختار الموافقة أو الرفض');
    const note = String(body.note || '').trim().slice(0, 240) || null;
    return this.db.transaction(async manager => {
      const rows = await manager.query('SELECT * FROM wallet_deposit_requests WHERE id = $1 FOR UPDATE', [id]);
      const request = rows[0];
      if (!request) throw new BadRequestException('طلب الإيداع غير موجود');
      if (request.status !== 'pending') throw new BadRequestException('تمت مراجعة هذا الطلب من قبل');
      if (decision === 'rejected') {
        await manager.query(`UPDATE wallet_deposit_requests SET status='rejected', admin_note=$2, reviewed_by_user_id=$3, reviewed_at=now() WHERE id=$1`, [id, note, adminId]);
        return { id, status: 'rejected' };
      }
      const amount = BigInt(request.amount_minor);
      await manager.query(`INSERT INTO wallet_accounts (owner_user_id, account_type, currency, balance_minor) VALUES ($1, 'user', $2, 0)
        ON CONFLICT (owner_user_id, currency) WHERE owner_user_id IS NOT NULL DO NOTHING`, [request.rider_user_id, request.currency]);
      const accountRows = await manager.query('SELECT id, balance_minor FROM wallet_accounts WHERE owner_user_id=$1 AND currency=$2 FOR UPDATE', [request.rider_user_id, request.currency]);
      const account = accountRows[0];
      if (!account) throw new BadRequestException('تعذر العثور على محفظة الراكب');
      await manager.query('UPDATE wallet_accounts SET balance_minor=balance_minor+$1, updated_at=now() WHERE id=$2', [amount.toString(), account.id]);
      await manager.query(`INSERT INTO wallet_transactions (from_account_id, to_account_id, created_by_user_id, type, amount_minor, currency, idempotency_key, related_trip_id, description)
        VALUES (NULL, $1, $2, 'card_top_up', $3, $4, $5, NULL, $6)`,
        [account.id, adminId, amount.toString(), request.currency, 'deposit-request:' + id, 'إيداع يدوي معتمد — طلب ' + id]);
      await manager.query(`UPDATE wallet_deposit_requests SET status='approved', admin_note=$2, reviewed_by_user_id=$3, reviewed_at=now() WHERE id=$1`, [id, note, adminId]);
      return { id, status: 'approved' };
    });
  }
}
