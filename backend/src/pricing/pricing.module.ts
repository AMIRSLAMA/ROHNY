import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../users/entities/user.entity';
import { PricingCity } from './entities/pricing-city.entity';
import { AdminPricingController, PublicPricingController } from './pricing.controller';
import { PricingService } from './pricing.service';

@Module({
  imports: [TypeOrmModule.forFeature([PricingCity, User]), AuthModule],
  controllers: [PublicPricingController, AdminPricingController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
