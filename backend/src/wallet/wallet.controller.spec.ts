import { ForbiddenException } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

describe('WalletController', () => {
  let controller: WalletController;
  let wallets: {
    getMyWallet: jest.Mock;
    listMyTransactions: jest.Mock;
    transferDriverToRider: jest.Mock;
  };

  beforeEach(() => {
    wallets = {
      getMyWallet: jest.fn(async () => ({ balanceMinor: '0', balanceEgp: '0.00' })),
      listMyTransactions: jest.fn(async () => []),
      transferDriverToRider: jest.fn(async () => ({ status: 'completed' })),
    };
    controller = new WalletController(wallets as unknown as WalletService);
  });

  it('allows a rider to view their own wallet', async () => {
    const request = { authUser: { sub: 'rider-id', role: 'rider' } } as any;
    await controller.getMyWallet(request);
    expect(wallets.getMyWallet).toHaveBeenCalledWith('rider-id');
  });

  it('allows a driver to view their own transactions', async () => {
    const request = { authUser: { sub: 'driver-id', role: 'driver' } } as any;
    await controller.listTransactions(request, '10');
    expect(wallets.listMyTransactions).toHaveBeenCalledWith('driver-id', 10);
  });

  it('does not expose a wallet to admin accounts', () => {
    const request = { authUser: { sub: 'admin-id', role: 'admin' } } as any;
    expect(() => controller.getMyWallet(request)).toThrow(ForbiddenException);
    expect(wallets.getMyWallet).not.toHaveBeenCalled();
  });

  it('rejects wallet transfer requests from riders', () => {
    const request = { authUser: { sub: 'rider-id', role: 'rider' } } as any;
    expect(() => controller.transferToCustomer(request, {
      recipientUserId: '00000000-0000-4000-8000-000000000001',
      amountMinor: 100,
      idempotencyKey: '00000000-0000-4000-8000-000000000002',
      description: 'Fare difference',
    })).toThrow(ForbiddenException);
    expect(wallets.transferDriverToRider).not.toHaveBeenCalled();
  });

  it('allows only drivers to request a customer wallet transfer', async () => {
    const request = { authUser: { sub: 'driver-id', role: 'driver' } } as any;
    const input = {
      recipientUserId: '00000000-0000-4000-8000-000000000001',
      amountMinor: 100,
      idempotencyKey: '00000000-0000-4000-8000-000000000002',
      description: 'Fare difference',
    };
    await controller.transferToCustomer(request, input);
    expect(wallets.transferDriverToRider).toHaveBeenCalledWith('driver-id', input);
  });

  it('rejects invalid transaction history limits', () => {
    const request = { authUser: { sub: 'rider-id', role: 'rider' } } as any;
    expect(() => controller.listTransactions(request, '101')).toThrow(ForbiddenException);
  });
});
