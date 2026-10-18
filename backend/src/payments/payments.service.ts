import {
  BadRequestException, ConflictException, ForbiddenException, Injectable,
  NotFoundException, ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { createHmac, timingSafeEqual } from 'crypto';
import { UserRole } from '../users/entities/user.entity';

export type PaymentPurpose = 'trip_fare' | 'rider_wallet_topup' | 'driver_commission' | 'driver_wallet_topup';

@Injectable()
export class PaymentsService {
  constructor(private readonly dataSource: DataSource, private readonly config: ConfigService) {}

  private get providerConfigured() {
    return Boolean(this.config.get<string>('PAYMOB_SECRET_KEY') &&
      this.config.get<string>('PAYMOB_PUBLIC_KEY') &&
      this.config.get<string>('PAYMOB_CARD_INTEGRATION_ID') &&
      this.config.get<string>('PAYMOB_HMAC_SECRET'));
  }

  async createCheckout(userId: string, role: string, input: {
    purpose: PaymentPurpose; tripId?: string; amountMinor?: number; currency?: string;
  }, idempotencyKey: string) {
    if (!this.providerConfigured) throw new ServiceUnavailableException(
      'Card payments are not activated: configure Paymob test credentials and verify the webhook before enabling checkout.',
    );

    const currency = (input.currency || 'EGP').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestException('currency must be a three-letter ISO code');

    let tripId: string | null = null;
    let amountMinor: bigint;
    let riderUserId: string | null = null;

    if (input.purpose === 'trip_fare' || input.purpose === 'driver_commission') {
      if (!input.tripId) throw new BadRequestException('tripId is required for trip fare or captain commission');
      const rows = await this.dataSource.query(
        'SELECT id, rider_id, driver_id, status, payment_method, fare_currency, fare_amount, platform_commission_amount FROM trips WHERE id=$1',
        [input.tripId],
      );
      const trip = rows[0];
      if (!trip) throw new NotFoundException('Trip not found');

      if (input.purpose === 'trip_fare') {
        if (role !== UserRole.RIDER || trip.rider_id !== userId) throw new ForbiddenException('Only the rider who owns this trip can pay its fare');
        if (trip.payment_method !== 'card') throw new BadRequestException('This trip was not created with card as its payment method');
        if (!trip.fare_amount || trip.fare_currency !== currency) throw new BadRequestException('Trip fare/currency is not available');
        amountMinor = this.toMinorUnits(String(trip.fare_amount), currency);
        riderUserId = userId;
      } else {
        if (role !== UserRole.DRIVER || trip.driver_id !== userId) throw new ForbiddenException('Only the captain assigned to this trip can pay its commission');
        if (trip.status !== 'completed') throw new BadRequestException('Captain commission can only be paid after the trip is completed');
        if (!trip.platform_commission_amount || trip.fare_currency !== currency) throw new BadRequestException('Trip commission/currency is not available');
        amountMinor = this.toMinorUnits(String(trip.platform_commission_amount), currency);
        riderUserId = String(trip.rider_id);
      }
      tripId = String(trip.id);
    } else {
      if (input.purpose === 'rider_wallet_topup' && role !== UserRole.RIDER) throw new ForbiddenException('Only riders can top up a rider wallet');
      if (input.purpose === 'driver_wallet_topup' && role !== UserRole.DRIVER) throw new ForbiddenException('Only captains can top up a captain wallet');
      if (!Number.isSafeInteger(input.amountMinor) || Number(input.amountMinor) < 100 || Number(input.amountMinor) > 100000000) {
        throw new BadRequestException('amountMinor must be between 100 and 100000000');
      }
      amountMinor = BigInt(input.amountMinor!);
      riderUserId = userId;
    }
    if (amountMinor <= 0n || amountMinor > 100000000n) throw new BadRequestException('Payment amount is outside the allowed range');

    const existing = await this.dataSource.query(
      'SELECT id, payer_user_id, purpose, trip_id, amount_minor, currency, status, checkout_url FROM card_payment_transactions WHERE idempotency_key=$1',
      [idempotencyKey],
    );
    if (existing[0]) {
      const p = existing[0];
      if (p.payer_user_id !== userId || p.purpose !== input.purpose || p.trip_id !== tripId ||
          BigInt(p.amount_minor) !== amountMinor || p.currency !== currency) {
        throw new ConflictException('Idempotency-Key was already used for a different payment');
      }
      return this.publicPayment(p, true);
    }

    const integrationId = Number(this.config.get<string>('PAYMOB_CARD_INTEGRATION_ID'));
    if (!Number.isInteger(integrationId) || integrationId <= 0) throw new ServiceUnavailableException('PAYMOB_CARD_INTEGRATION_ID is invalid');
    const redirect = this.config.get<string>('PAYMOB_REDIRECTION_URL');
    const webhook = this.config.get<string>('PAYMOB_WEBHOOK_URL');
    if (!redirect || !webhook) throw new ServiceUnavailableException('Set PAYMOB_REDIRECTION_URL and PAYMOB_WEBHOOK_URL before enabling checkout');

    const inserted = await this.dataSource.query(
      `INSERT INTO card_payment_transactions
       (trip_id,rider_user_id,payer_user_id,purpose,provider,idempotency_key,amount_minor,currency,status)
       VALUES ($1,$2,$3,$4,'paymob',$5,$6,$7,'pending')
       RETURNING id,payer_user_id,purpose,trip_id,amount_minor,currency,status,checkout_url`,
      [tripId, riderUserId, userId, input.purpose, idempotencyKey, amountMinor.toString(), currency],
    );
    const payment = inserted[0];

    try {
      const baseUrl = this.config.get<string>('PAYMOB_BASE_URL', 'https://accept.paymob.com')!.replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/v1/intention/`, {
        method: 'POST',
        headers: { Authorization: `Token ${this.config.get<string>('PAYMOB_SECRET_KEY')!}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(amountMinor), currency, payment_methods: [integrationId],
          items: [{ name: this.label(input.purpose), amount: Number(amountMinor), description: `ROHNY payment ${payment.id}`, quantity: 1 }],
          billing_data: {
            first_name: 'ROHNY', last_name: 'Customer', email: 'customer@rohny.invalid',
            phone_number: '+200000000000', apartment: 'NA', floor: 'NA', street: 'NA',
            building: 'NA', shipping_method: 'NA', postal_code: 'NA', city: 'NA',
            country: currency === 'EGP' ? 'EGY' : 'NA', state: 'NA',
          },
          special_reference: payment.id, notification_url: webhook, redirection_url: redirect,
        }),
      });
      const payload: any = await response.json().catch(() => ({}));
      if (!response.ok || !payload.client_secret) {
        await this.dataSource.query(
          "UPDATE card_payment_transactions SET status='failed',failure_code='provider_intention_failed',failure_message=$1,updated_at=now() WHERE id=$2 AND status='pending'",
          [`Paymob intention creation failed (HTTP ${response.status})`, payment.id],
        );
        throw new ServiceUnavailableException('Payment provider did not create a checkout session');
      }
      const publicKey = this.config.get<string>('PAYMOB_PUBLIC_KEY')!;
      const checkoutUrl = `${baseUrl}/unifiedcheckout/?publicKey=${encodeURIComponent(publicKey)}&clientSecret=${encodeURIComponent(payload.client_secret)}`;
      await this.dataSource.query(
        "UPDATE card_payment_transactions SET provider_payment_id=$1,checkout_url=$2,status='requires_action',updated_at=now() WHERE id=$3 AND status='pending'",
        [String(payload.id ?? payment.id), checkoutUrl, payment.id],
      );
      return { paymentId: payment.id, purpose: input.purpose, amountMinor: amountMinor.toString(), currency, status: 'requires_action', checkoutUrl, provider: 'paymob' };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      await this.dataSource.query(
        "UPDATE card_payment_transactions SET status='failed',failure_code='provider_unavailable',failure_message='Payment provider request failed',updated_at=now() WHERE id=$1 AND status='pending'",
        [payment.id],
      );
      throw new ServiceUnavailableException('Could not create a payment session');
    }
  }

  async listMine(userId: string, role: string) {
    const where = role === UserRole.ADMIN ? '' : 'WHERE payer_user_id=$1';
    const params = role === UserRole.ADMIN ? [] : [userId];
    return this.dataSource.query(
      `SELECT id,purpose,trip_id AS "tripId",amount_minor AS "amountMinor",currency,status,provider,
       created_at AS "createdAt",succeeded_at AS "succeededAt",failure_code AS "failureCode"
       FROM card_payment_transactions ${where} ORDER BY created_at DESC LIMIT 100`, params,
    );
  }

  async handlePaymobWebhook(body: Record<string, any>, receivedHmac?: string) {
    const secret = this.config.get<string>('PAYMOB_HMAC_SECRET');
    if (!secret) throw new ServiceUnavailableException('Paymob webhook verification is not configured');
    const obj = body?.obj ?? body;
    if (!obj || !receivedHmac || !this.verifyTransactionHmac(obj, receivedHmac, secret)) {
      throw new UnauthorizedException('Invalid Paymob webhook signature');
    }
    const reference = String(obj.special_reference ?? obj.order?.merchant_order_id ?? '');
    if (!reference) throw new BadRequestException('Missing payment reference');
    const success = obj.success === true || obj.success === 'true';
    const failed = obj.success === false || obj.success === 'false' || obj.error_occured === true;
    if (!success && !failed) return { received: true, processed: false };

    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query('SELECT * FROM card_payment_transactions WHERE id=$1 FOR UPDATE', [reference]);
      const payment = rows[0];
      if (!payment || payment.provider !== 'paymob') return { received: true, processed: false };
      if (payment.status === 'succeeded' || payment.status === 'failed') return { received: true, processed: true, duplicate: true };
      if (String(obj.amount_cents ?? '') !== String(payment.amount_minor) || String(obj.currency ?? '').toUpperCase() !== payment.currency) {
        throw new BadRequestException('Provider amount or currency does not match stored payment');
      }
      const eventKey = `paymob:${String(obj.id)}`;
      if (failed) {
        await manager.query("UPDATE card_payment_transactions SET status='failed',failure_code='provider_declined',failure_message='Payment provider reported failure',updated_at=now() WHERE id=$1", [payment.id]);
        await manager.query(
          "INSERT INTO card_payment_events (payment_id,event_key,event_type,previous_status,new_status,source) VALUES ($1,$2,'payment.failed',$3,'failed','paymob') ON CONFLICT (event_key) DO NOTHING",
          [payment.id,eventKey,payment.status],
        );
        return { received: true, processed: true, status: 'failed' };
      }

      if (payment.purpose === 'rider_wallet_topup' || payment.purpose === 'driver_wallet_topup') {
        const userRows = await manager.query('SELECT role FROM users WHERE id=$1 FOR UPDATE', [payment.payer_user_id]);
        const expectedRole = payment.purpose === 'rider_wallet_topup' ? UserRole.RIDER : UserRole.DRIVER;
        if (!userRows[0] || userRows[0].role !== expectedRole) throw new BadRequestException('Wallet owner role does not match payment purpose');
        await manager.query(
          "INSERT INTO wallet_accounts (owner_user_id,account_type,currency,balance_minor) VALUES ($1,'user',$2,0) ON CONFLICT (owner_user_id,currency) WHERE owner_user_id IS NOT NULL DO NOTHING",
          [payment.payer_user_id,payment.currency],
        );
        const accounts = await manager.query('SELECT id FROM wallet_accounts WHERE owner_user_id=$1 AND currency=$2 FOR UPDATE', [payment.payer_user_id,payment.currency]);
        if (!accounts[0]) throw new NotFoundException('Wallet account not found');
        const ledgerKey = `card-payment:${payment.id}`;
        const previous = await manager.query('SELECT id FROM wallet_transactions WHERE idempotency_key=$1', [ledgerKey]);
        if (!previous[0]) {
          await manager.query('UPDATE wallet_accounts SET balance_minor=balance_minor+$1,updated_at=now() WHERE id=$2', [String(payment.amount_minor),accounts[0].id]);
          await manager.query(
            "INSERT INTO wallet_transactions (from_account_id,to_account_id,created_by_user_id,type,amount_minor,currency,idempotency_key,related_trip_id,description) VALUES (NULL,$1,$2,'card_top_up',$3,$4,$5,$6,$7)",
            [accounts[0].id,payment.payer_user_id,String(payment.amount_minor),payment.currency,ledgerKey,payment.trip_id,this.label(payment.purpose)],
          );
        }
      }
      await manager.query(
        "UPDATE card_payment_transactions SET status='succeeded',succeeded_at=now(),updated_at=now(),provider_payment_id=COALESCE(provider_payment_id,$1) WHERE id=$2",
        [String(obj.id),payment.id],
      );
      await manager.query(
        "INSERT INTO card_payment_events (payment_id,event_key,event_type,previous_status,new_status,source) VALUES ($1,$2,'payment.succeeded',$3,'succeeded','paymob') ON CONFLICT (event_key) DO NOTHING",
        [payment.id,eventKey,payment.status],
      );
      return { received: true, processed: true, status: 'succeeded' };
    });
  }

  private verifyTransactionHmac(obj: Record<string, any>, received: string, secret: string) {
    const values = [
      obj.amount_cents,obj.created_at,obj.currency,obj.error_occured,obj.has_parent_transaction,
      obj.id,obj.integration_id,obj.is_3d_secure,obj.is_auth,obj.is_capture,obj.is_refunded,
      obj.is_standalone_payment,obj.is_voided,obj.order?.id,obj.owner,obj.pending,
      obj.source_data?.pan,obj.source_data?.sub_type,obj.source_data?.type,obj.success,
    ];
    const calculated = createHmac('sha512',secret).update(values.map((v) => String(v ?? '')).join('')).digest('hex');
    const a = Buffer.from(calculated.toLowerCase()); const b = Buffer.from(String(received).toLowerCase());
    return a.length === b.length && timingSafeEqual(a,b);
  }

  private toMinorUnits(value: string, currency: string) {
    const digits = new Intl.NumberFormat('en-US',{style:'currency',currency}).resolvedOptions().maximumFractionDigits ?? 2;
    const parts = value.split('.');
    return BigInt(parts[0] || '0') * (10n ** BigInt(digits)) + BigInt((parts[1] || '').padEnd(digits,'0').slice(0,digits) || '0');
  }

  private label(purpose: PaymentPurpose) {
    return ({
      trip_fare: 'ROHNY trip fare',
      rider_wallet_topup: 'ROHNY rider wallet top-up',
      driver_commission: 'ROHNY captain commission',
      driver_wallet_topup: 'ROHNY captain wallet top-up',
    } as Record<PaymentPurpose,string>)[purpose];
  }

  private publicPayment(p: any, duplicateRequest = false) {
    return { paymentId:p.id,purpose:p.purpose,tripId:p.trip_id ?? undefined,amountMinor:String(p.amount_minor),currency:p.currency,status:p.status,checkoutUrl:p.checkout_url ?? undefined,duplicateRequest };
  }
}
