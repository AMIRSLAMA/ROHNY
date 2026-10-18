import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateDriverLocationDto } from './dto/update-driver-location.dto';
import { Trip, TripPaymentMethod, TripStatus } from './entities/trip.entity';
import { PricingService } from '../pricing/pricing.service';

type WalletRow = { id: string; balance_minor: string; currency: string };

@Injectable()
export class TripsService {
  constructor(
    @InjectRepository(Trip)
    private readonly tripsRepository: Repository<Trip>,
    private readonly pricingService: PricingService,
    private readonly dataSource: DataSource,
  ) {}

  private currencyDigits(currency: string): number {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  }

  private toMinor(amount: number, currency: string): bigint {
    return BigInt(Math.round(amount * (10 ** this.currencyDigits(currency))));
  }

  private async ensureWallet(manager: import('typeorm').EntityManager, userId: string, currency: string): Promise<WalletRow> {
    await manager.query(
      `INSERT INTO wallet_accounts (owner_user_id, account_type, currency, balance_minor)
       VALUES ($1, 'user', $2, 0)
       ON CONFLICT (owner_user_id, currency) WHERE owner_user_id IS NOT NULL DO NOTHING`,
      [userId, currency],
    );
    const rows: WalletRow[] = await manager.query(
      'SELECT id, balance_minor, currency FROM wallet_accounts WHERE owner_user_id=$1 AND currency=$2 FOR UPDATE',
      [userId, currency],
    );
    if (!rows[0]) throw new NotFoundException('Wallet account could not be created');
    return rows[0];
  }

  private async requiredCommissionMinor(manager: import('typeorm').EntityManager, trip: any): Promise<bigint> {
    if (trip.rider_free_ride) return 0n;
    const settingRows = await manager.query(
      "SELECT setting_value FROM rohny_accounting_settings WHERE setting_key='platform_commission_percent'",
    );
    const percent = settingRows[0] ? Number(settingRows[0].setting_value) : 10;
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new ConflictException('ROHNY commission setting is invalid');
    }
    const fare = Number(trip.fare_amount);
    if (!Number.isFinite(fare) || fare < 0 || !trip.fare_currency) {
      throw new ConflictException('Trip fare or currency is not available for accounting');
    }
    const commission = Math.round(fare * percent) / 100;
    return this.toMinor(commission, trip.fare_currency);
  }

  async createForRider(riderId: string, input: CreateTripDto) {
    if (!input.pickupAddress.trim() || !input.destinationAddress.trim()) {
      throw new BadRequestException('Pickup and destination addresses are required');
    }

    if (input.rideType === 'scooter' && input.passengerCount !== 1) {
      throw new BadRequestException('Scooter trips allow one passenger only');
    }

    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (scheduledAt && scheduledAt.getTime() < Date.now() + 5 * 60 * 1000) {
      throw new BadRequestException('Scheduled trips must be at least five minutes in the future');
    }

    const fare = await this.pricingService.quote({
      cityCode: input.cityCode,
      rideType: input.rideType,
      pickupLatitude: input.pickupLatitude,
      pickupLongitude: input.pickupLongitude,
      destinationLatitude: input.destinationLatitude,
      destinationLongitude: input.destinationLongitude,
    });
    if (Math.abs(fare.fareAmount - input.quotedFareAmount) >= 0.01 || fare.currency !== input.quotedCurrency.toUpperCase()) {
      throw new ConflictException('Fare or currency changed since your quote. Please review the updated fare and try again.');
    }

    return this.dataSource.transaction(async (manager) => {
      // Serialize bookings per rider so one earned free ride cannot be reserved twice.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['rider-free-ride:' + riderId]);
      const rewards = await manager.query(
        `SELECT
           (SELECT COUNT(*)::int FROM rohny_reward_ledger WHERE user_id=$1 AND reward_type='rider_free_ride_earned') AS earned,
           (SELECT COUNT(*)::int FROM rohny_reward_ledger WHERE user_id=$1 AND reward_type='rider_free_ride_used') AS used,
           EXISTS (
             SELECT 1 FROM trips
             WHERE rider_id=$1 AND rider_free_ride=true
               AND status NOT IN ('cancelled','completed')
           ) AS reserved`,
        [riderId],
      );
      const reward = rewards[0] ?? { earned: 0, used: 0, reserved: false };
      const riderFreeRide = Number(reward.earned) > Number(reward.used) && !reward.reserved;

      const trip = manager.getRepository(Trip).create({
        riderId,
        driverId: null,
        pickupAddress: input.pickupAddress.trim(),
        pickupLatitude: input.pickupLatitude,
        pickupLongitude: input.pickupLongitude,
        destinationAddress: input.destinationAddress.trim(),
        destinationLatitude: input.destinationLatitude,
        destinationLongitude: input.destinationLongitude,
        rideType: input.rideType,
        passengerCount: input.passengerCount,
        paymentMethod: input.paymentMethod,
        scheduledAt,
        riderNote: input.riderNote?.trim() || null,
        cityCode: fare.cityCode,
        fareCurrency: fare.currency,
        fareAmount: fare.fareAmount.toFixed(2),
        fareDistanceMeters: fare.distanceMeters,
        fareDurationSeconds: fare.durationSeconds,
        estimatedDistanceMeters: fare.distanceMeters,
        estimatedDurationSeconds: fare.durationSeconds,
        status: TripStatus.PENDING,
      });
      const saved = await manager.getRepository(Trip).save(trip);
      if (riderFreeRide) {
        await manager.query('UPDATE trips SET rider_free_ride=true WHERE id=$1', [saved.id]);
        (saved as Trip & { riderFreeRide?: boolean }).riderFreeRide = true;
      }
      return saved;
    });
  }

  findForRider(riderId: string) {
    return this.tripsRepository.find({
      where: { riderId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  findForDriver(driverId: string) {
    return this.tripsRepository.find({
      where: { driverId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async findAvailableForDrivers(driverId: string) {
    const currencyRows = await this.dataSource.query(
      "SELECT DISTINCT fare_currency FROM trips WHERE status='pending' AND driver_id IS NULL AND fare_currency IS NOT NULL",
    );
    // Return available trips only when this driver's wallet can cover the commission for the quoted fare.
    const walletRows = await this.dataSource.query(
      "SELECT currency, balance_minor FROM wallet_accounts WHERE owner_user_id=$1",
      [driverId],
    );
    const wallets = new Map<string, bigint>(walletRows.map((row: any) => [row.currency, BigInt(row.balance_minor)]));
    const commissionPercentRows = await this.dataSource.query(
      "SELECT setting_value FROM rohny_accounting_settings WHERE setting_key='platform_commission_percent'",
    );
    const percent = commissionPercentRows[0] ? Number(commissionPercentRows[0].setting_value) : 10;
    const trips = await this.tripsRepository.createQueryBuilder('trip')
      .where('trip.status = :status', { status: TripStatus.PENDING })
      .andWhere('trip.driverId IS NULL')
      .andWhere('(trip.scheduledAt IS NULL OR trip.scheduledAt <= :now)', { now: new Date() })
      .andWhere('NOT (:driverId = ANY(trip.rejectedDriverIds))', { driverId })
      .orderBy('trip.createdAt', 'ASC')
      .take(100)
      .getMany();
    const knownCurrencies = new Set<string>(currencyRows.map((row: any) => row.fare_currency));
    return trips.filter((trip) => {
      const currency = trip.fareCurrency;
      if (!currency || !knownCurrencies.has(currency)) return false;
      const fare = Number(trip.fareAmount);
      if (trip as any && (trip as any).riderFreeRide) return true;
      const commission = this.toMinor(Math.round(fare * percent) / 100, currency);
      return (wallets.get(currency) ?? 0n) >= commission;
    });
  }

  async rejectForDriver(driverId: string, tripId: string) {
    const rows = await this.tripsRepository.query(
      `UPDATE "trips"
       SET "rejected_driver_ids" = array_append("rejected_driver_ids", $1::uuid),
           "updated_at" = now()
       WHERE "id" = $2::uuid
         AND "status" = $3
         AND "driver_id" IS NULL
         AND NOT ($1::uuid = ANY("rejected_driver_ids"))
       RETURNING "id"`,
      [driverId, tripId, TripStatus.PENDING],
    );
    if (!rows.length) {
      const trip = await this.tripsRepository.findOne({ where: { id: tripId } });
      if (!trip) throw new NotFoundException('Trip not found');
      if (trip.status !== TripStatus.PENDING || trip.driverId) {
        throw new ConflictException('Trip is no longer available to reject');
      }
      return { tripId, status: 'already_rejected' };
    }
    return { tripId, status: 'rejected' };
  }

  async acceptForDriver(driverId: string, tripId: string) {
    await this.dataSource.transaction(async (manager) => {
      const rows = await manager.query('SELECT * FROM trips WHERE id=$1 FOR UPDATE', [tripId]);
      const trip = rows[0];
      if (!trip) throw new NotFoundException('Trip not found');
      if (trip.status !== TripStatus.PENDING || trip.driver_id !== null) {
        throw new ConflictException('Trip is no longer available to accept');
      }
      if (trip.scheduled_at && new Date(trip.scheduled_at).getTime() > Date.now()) {
        throw new ConflictException('Scheduled trip is not available yet');
      }
      const commission = await this.requiredCommissionMinor(manager, trip);
      const wallet = await this.ensureWallet(manager, driverId, trip.fare_currency || 'EGP');
      if (BigInt(wallet.balance_minor) < commission) {
        throw new ConflictException('Your wallet balance must cover the platform commission before accepting this trip');
      }
      await manager.query(
        "UPDATE trips SET driver_id=$1, status=$2, updated_at=now() WHERE id=$3 AND status=$4 AND driver_id IS NULL",
        [driverId, TripStatus.ACCEPTED, tripId, TripStatus.PENDING],
      );
    });
    const trip = await this.tripsRepository.findOne({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');
    return trip;
  }


  async updateDriverLocation(driverId: string, tripId: string, input: UpdateDriverLocationDto) {
    const rows = await this.dataSource.query('SELECT id, driver_id, status FROM trips WHERE id=$1',[tripId]);
    const trip=rows[0];
    if(!trip)throw new NotFoundException('Trip not found');
    if(trip.driver_id!==driverId||!['accepted','driver_arriving','in_progress'].includes(trip.status))throw new ConflictException('Trip is not assigned to you or is no longer active');
    const saved=await this.dataSource.query(`
      INSERT INTO trip_driver_locations(trip_id,driver_id,latitude,longitude,accuracy_meters,heading_degrees,speed_meters_per_second,recorded_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,now())
      ON CONFLICT(trip_id) DO UPDATE SET driver_id=EXCLUDED.driver_id,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,
        accuracy_meters=EXCLUDED.accuracy_meters,heading_degrees=EXCLUDED.heading_degrees,
        speed_meters_per_second=EXCLUDED.speed_meters_per_second,recorded_at=now()
      WHERE trip_driver_locations.driver_id=EXCLUDED.driver_id
      RETURNING trip_id AS "tripId",recorded_at AS "recordedAt"`,
      [tripId,driverId,input.latitude,input.longitude,input.accuracyMeters??null,input.headingDegrees??null,input.speedMetersPerSecond??null]);
    if(!saved.length)throw new ConflictException('Could not update trip location');
    return {tripId:saved[0].tripId,recordedAt:saved[0].recordedAt};
  }

  async getRiderTripLocation(riderId: string, tripId: string) {
    const rows=await this.dataSource.query(`
      SELECT t.id AS "tripId",t.status,t.pickup_address AS "pickupAddress",t.pickup_latitude AS "pickupLatitude",
        t.pickup_longitude AS "pickupLongitude",t.destination_address AS "destinationAddress",
        t.destination_latitude AS "destinationLatitude",t.destination_longitude AS "destinationLongitude",
        l.latitude AS "driverLatitude",l.longitude AS "driverLongitude",l.accuracy_meters AS "accuracyMeters",
        l.heading_degrees AS "headingDegrees",l.speed_meters_per_second AS "speedMetersPerSecond",l.recorded_at AS "recordedAt"
      FROM trips t LEFT JOIN trip_driver_locations l ON l.trip_id=t.id AND l.driver_id=t.driver_id
      WHERE t.id=$1 AND t.rider_id=$2 LIMIT 1`,[tripId,riderId]);
    const t=rows[0];if(!t)throw new NotFoundException('Trip not found');
    if(!['accepted','driver_arriving','in_progress'].includes(t.status)){
      await this.dataSource.query('DELETE FROM trip_driver_locations WHERE trip_id=$1',[tripId]);
      return {tripId:t.tripId,status:t.status,pickupAddress:t.pickupAddress,pickupLatitude:Number(t.pickupLatitude),pickupLongitude:Number(t.pickupLongitude),destinationAddress:t.destinationAddress,destinationLatitude:Number(t.destinationLatitude),destinationLongitude:Number(t.destinationLongitude),driverLocation:null};
    }
    const has=t.driverLatitude!==null&&t.driverLatitude!==undefined&&t.driverLongitude!==null&&t.driverLongitude!==undefined;
    return {tripId:t.tripId,status:t.status,pickupAddress:t.pickupAddress,pickupLatitude:Number(t.pickupLatitude),pickupLongitude:Number(t.pickupLongitude),destinationAddress:t.destinationAddress,destinationLatitude:Number(t.destinationLatitude),destinationLongitude:Number(t.destinationLongitude),driverLocation:has?{latitude:Number(t.driverLatitude),longitude:Number(t.driverLongitude),accuracyMeters:t.accuracyMeters===null?null:Number(t.accuracyMeters),headingDegrees:t.headingDegrees===null?null:Number(t.headingDegrees),speedMetersPerSecond:t.speedMetersPerSecond===null?null:Number(t.speedMetersPerSecond),recordedAt:t.recordedAt}:null};
  }

  async updateStatusForDriver(driverId: string, tripId: string, nextStatus: TripStatus) {
    const previousStatus: Partial<Record<TripStatus, TripStatus>> = {
      [TripStatus.DRIVER_ARRIVING]: TripStatus.ACCEPTED,
      [TripStatus.IN_PROGRESS]: TripStatus.DRIVER_ARRIVING,
      [TripStatus.COMPLETED]: TripStatus.IN_PROGRESS,
    };
    const expectedStatus = previousStatus[nextStatus];
    if (!expectedStatus) {
      throw new BadRequestException('Unsupported driver trip status transition');
    }

    if (nextStatus === TripStatus.COMPLETED) {
      return this.completeTripWithAccounting(driverId, tripId);
    }

    if (nextStatus === TripStatus.IN_PROGRESS) {
      await this.dataSource.transaction(async (manager) => {
        const rows = await manager.query('SELECT * FROM trips WHERE id=$1 FOR UPDATE', [tripId]);
        const trip = rows[0];
        if (!trip) throw new NotFoundException('Trip not found');
        if (trip.driver_id !== driverId || trip.status !== expectedStatus) {
          throw new ConflictException('Trip is not assigned to you or its status has changed');
        }
        const commission = await this.requiredCommissionMinor(manager, trip);
        const wallet = await this.ensureWallet(manager, driverId, trip.fare_currency || 'EGP');
        if (BigInt(wallet.balance_minor) < commission) {
          throw new ConflictException('Your wallet balance must cover the platform commission before starting a trip');
        }
        await manager.query('UPDATE trips SET status=$1, updated_at=now() WHERE id=$2', [nextStatus, tripId]);
      });
    } else {
      const result = await this.tripsRepository.createQueryBuilder()
        .update(Trip)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where('"id" = :tripId', { tripId })
        .andWhere('"driver_id" = :driverId', { driverId })
        .andWhere('"status" = :expectedStatus', { expectedStatus })
        .execute();
      if (!result.affected) {
        throw new ConflictException('Trip is not assigned to you or its status has changed');
      }
    }

    const trip = await this.tripsRepository.findOne({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');
    return trip;
  }

  private async completeTripWithAccounting(driverId: string, tripId: string) {
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query('SELECT * FROM trips WHERE id=$1 FOR UPDATE', [tripId]);
      const trip = rows[0];
      if (!trip) throw new NotFoundException('Trip not found');
      if (trip.driver_id !== driverId || trip.status !== TripStatus.IN_PROGRESS) {
        throw new ConflictException('Trip is not assigned to you or its status has changed');
      }
      if (!trip.fare_currency || !trip.fare_amount) {
        throw new ConflictException('Trip fare details are missing; accounting cannot be completed');
      }

      const currency = String(trip.fare_currency);
      const fare = Number(trip.fare_amount);
      const commission = await this.requiredCommissionMinor(manager, trip);
      const driverWallet = await this.ensureWallet(manager, driverId, currency);
      const driverBalance = BigInt(driverWallet.balance_minor);
      const fareMinor = this.toMinor(fare, currency);
      let riderWallet: WalletRow | null = null;
      if (trip.payment_method === TripPaymentMethod.WALLET && !trip.rider_free_ride) {
        riderWallet = await this.ensureWallet(manager, String(trip.rider_id), currency);
        if (BigInt(riderWallet.balance_minor) < fareMinor) {
          throw new ConflictException('Insufficient rider wallet balance to pay for this trip');
        }
      }
      const availableForCommission = driverBalance + (riderWallet ? fareMinor : 0n);
      if (availableForCommission < commission) {
        throw new ConflictException('Insufficient wallet balance to settle platform commission; deposit funds then retry trip completion');
      }

      // For wallet-paid trips, transfer the fare from the rider to the captain exactly once.
      // This runs in the same transaction as completion and platform commission accounting.
      if (riderWallet && fareMinor > 0n) {
        await manager.query(
          'UPDATE wallet_accounts SET balance_minor=balance_minor-$1, updated_at=now() WHERE id=$2',
          [fareMinor.toString(), riderWallet.id],
        );
        await manager.query(
          'UPDATE wallet_accounts SET balance_minor=balance_minor+$1, updated_at=now() WHERE id=$2',
          [fareMinor.toString(), driverWallet.id],
        );
        await manager.query(
          `INSERT INTO wallet_transactions (from_account_id, to_account_id, created_by_user_id, type, amount_minor, currency, idempotency_key, related_trip_id, description)
           VALUES ($1, $2, $3, 'trip_payment', $4, $5, $6, $7, $8)`,
          [riderWallet.id, driverWallet.id, trip.rider_id, fareMinor.toString(), currency, 'trip-payment:' + tripId, tripId, 'ROHNY wallet trip fare paid by rider'],
        );
      }

      await manager.query(
        `INSERT INTO wallet_accounts (account_type, currency, balance_minor)
         VALUES ('platform', $1, 0)
         ON CONFLICT (account_type, currency) WHERE account_type='platform' DO NOTHING`,
        [currency],
      );
      const platformRows = await manager.query(
        "SELECT id FROM wallet_accounts WHERE account_type='platform' AND currency=$1 FOR UPDATE",
        [currency],
      );
      const platformWallet = platformRows[0];
      if (!platformWallet) throw new ConflictException('Platform wallet is not available');

      if (commission > 0n) {
        await manager.query('UPDATE wallet_accounts SET balance_minor=balance_minor-$1, updated_at=now() WHERE id=$2', [commission.toString(), driverWallet.id]);
        await manager.query('UPDATE wallet_accounts SET balance_minor=balance_minor+$1, updated_at=now() WHERE id=$2', [commission.toString(), platformWallet.id]);
        await manager.query(
          `INSERT INTO wallet_transactions (from_account_id, to_account_id, created_by_user_id, type, amount_minor, currency, idempotency_key, related_trip_id, description)
           VALUES ($1, $2, $3, 'platform_commission', $4, $5, $6, $7, $8)`,
          [driverWallet.id, platformWallet.id, driverId, commission.toString(), currency, 'trip-commission:' + tripId, tripId, 'ROHNY 10% platform commission'],
        );
      }

      if (trip.rider_free_ride) {
        if (fareMinor > 0n) {
          await manager.query('UPDATE wallet_accounts SET balance_minor=balance_minor+$1, updated_at=now() WHERE id=$2', [fareMinor.toString(), driverWallet.id]);
          await manager.query(
            `INSERT INTO wallet_transactions (from_account_id, to_account_id, created_by_user_id, type, amount_minor, currency, idempotency_key, related_trip_id, description)
             VALUES (NULL, $1, NULL, 'platform_reward', $2, $3, $4, $5, $6)`,
            [driverWallet.id, fareMinor.toString(), currency, 'free-trip-fare:' + tripId, tripId, 'ROHNY platform-funded free trip fare'],
          );
        }
        await manager.query(
          `INSERT INTO rohny_reward_ledger (user_id, trip_id, reward_type, amount, currency, details)
           VALUES ($1, $2, 'rider_free_ride_used', 0, $3, $4::jsonb)
           ON CONFLICT (trip_id, reward_type) DO NOTHING`,
          [trip.rider_id, tripId, currency, JSON.stringify({ fareAmount: fare, fundedBy: 'ROHNY' })],
        );
      }

      await manager.query(
        "UPDATE trips SET status=$1, platform_commission_amount=$2, accounting_processed_at=now(), updated_at=now() WHERE id=$3",
        [TripStatus.COMPLETED, (Number(commission) / (10 ** this.currencyDigits(currency))).toFixed(this.currencyDigits(currency)), tripId],
      );
      await manager.query('DELETE FROM trip_driver_locations WHERE trip_id=$1',[tripId]);

      const riderCountRows = await manager.query("SELECT COUNT(*)::int AS count FROM trips WHERE rider_id=$1 AND status='completed'", [trip.rider_id]);
      const riderCompletedCount = Number(riderCountRows[0]?.count ?? 0);
      const freeEveryRows = await manager.query("SELECT setting_value FROM rohny_accounting_settings WHERE setting_key='rider_free_ride_every'");
      const freeEvery = Math.max(1, Number(freeEveryRows[0]?.setting_value ?? 5));
      if (riderCompletedCount > 0 && riderCompletedCount % freeEvery === 0) {
        await manager.query(
          `INSERT INTO rohny_reward_ledger (user_id, trip_id, reward_type, amount, currency, details)
           VALUES ($1, $2, 'rider_free_ride_earned', 0, $3, $4::jsonb)
           ON CONFLICT (trip_id, reward_type) DO NOTHING`,
          [trip.rider_id, tripId, currency, JSON.stringify({ completedTrips: riderCompletedCount, freeEvery })],
        );
      }

      const driverCountRows = await manager.query("SELECT COUNT(*)::int AS count FROM trips WHERE driver_id=$1 AND status='completed'", [driverId]);
      const driverCompletedCount = Number(driverCountRows[0]?.count ?? 0);
      const bonusEveryRows = await manager.query("SELECT setting_value FROM rohny_accounting_settings WHERE setting_key='captain_bonus_every'");
      const bonusEvery = Math.max(1, Number(bonusEveryRows[0]?.setting_value ?? 10));
      const bonusAmountRows = await manager.query("SELECT setting_value FROM rohny_accounting_settings WHERE setting_key='captain_bonus_amount_egp'");
      const bonusAmount = Number(bonusAmountRows[0]?.setting_value ?? 50);
      if (driverCompletedCount > 0 && driverCompletedCount % bonusEvery === 0 && bonusAmount > 0) {
        const bonusWallet = await this.ensureWallet(manager, driverId, 'EGP');
        const bonusMinor = this.toMinor(bonusAmount, 'EGP');
        await manager.query('UPDATE wallet_accounts SET balance_minor=balance_minor+$1, updated_at=now() WHERE id=$2', [bonusMinor.toString(), bonusWallet.id]);
        await manager.query(
          `INSERT INTO wallet_transactions (from_account_id, to_account_id, created_by_user_id, type, amount_minor, currency, idempotency_key, related_trip_id, description)
           VALUES (NULL, $1, NULL, 'captain_bonus', $2, 'EGP', $3, $4, $5)`,
          [bonusWallet.id, bonusMinor.toString(), 'captain-bonus:' + tripId, tripId, 'ROHNY captain milestone reward'],
        );
        await manager.query(
          `INSERT INTO rohny_reward_ledger (user_id, trip_id, reward_type, amount, currency, details)
           VALUES ($1, $2, 'captain_bonus', $3, 'EGP', $4::jsonb)
           ON CONFLICT (trip_id, reward_type) DO NOTHING`,
          [driverId, tripId, bonusAmount.toFixed(2), JSON.stringify({ completedTrips: driverCompletedCount, bonusEvery })],
        );
        await manager.query('UPDATE trips SET captain_reward_amount=$1 WHERE id=$2', [bonusAmount.toFixed(2), tripId]);
      }

      const completed = await manager.getRepository(Trip).findOne({ where: { id: tripId } });
      return { ...completed, riderFreeRide: Boolean(trip.rider_free_ride), platformCommissionAmount: (Number(commission) / (10 ** this.currencyDigits(currency))).toFixed(this.currencyDigits(currency)), captainRewardAmount: driverCompletedCount > 0 && driverCompletedCount % Math.max(1, Number(bonusEveryRows[0]?.setting_value ?? 10)) === 0 ? Number(bonusAmount) : 0 };
    });
  }

  async cancelForRider(riderId: string, tripId: string) {
    const result = await this.tripsRepository.createQueryBuilder()
      .update(Trip)
      .set({ status: TripStatus.CANCELLED, driverId: null, updatedAt: new Date() })
      .where('"id" = :tripId', { tripId })
      .andWhere('"rider_id" = :riderId', { riderId })
      .andWhere('"status" IN (:...cancellable)', {
        cancellable: [TripStatus.PENDING, TripStatus.ACCEPTED],
      })
      .execute();

    if (!result.affected) {
      const trip = await this.tripsRepository.findOne({ where: { id: tripId, riderId } });
      if (!trip) throw new NotFoundException('Trip not found');
      throw new ConflictException('This trip can no longer be cancelled');
    }

    await this.dataSource.query('DELETE FROM trip_driver_locations WHERE trip_id=$1',[tripId]);
    return this.tripsRepository.findOne({ where: { id: tripId, riderId } });
  }
}
