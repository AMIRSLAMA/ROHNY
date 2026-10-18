import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

describe('WalletController', () => {
  let controller: WalletController;
  let dataSource: { query: jest.Mock };
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
    dataSource = { query: jest.fn(async () => []) };
    controller = new WalletController(wallets as unknown as WalletService, dataSource as any);
  });

  it('allows a rider to view their own wallet', async () => {
    const request = { authUser: { sub: 'rider-id', role: 'rider' } } as any;
    await controller.getMyWallet(request);
    expect(wallets.getMyWallet).toHaveBeenCalledWith('rider-id', undefined);
  });

  it('allows a driver to view their own transactions', async () => {
    const request = { authUser: { sub: 'driver-id', role: 'driver' } } as any;
    await controller.listTransactions(request, '10');
    expect(wallets.listMyTransactions).toHaveBeenCalledWith('driver-id', 10, undefined);
  });

  it('does not expose a wallet to admin accounts', () => {
    const request = { authUser: { sub: 'admin-id', role: 'admin' } } as any;
    expect(() => controller.getMyWallet(request)).toThrow(ForbiddenException);
    expect(wallets.getMyWallet).not.toHaveBeenCalled();
  });

  it('rejects wallet transfer requests from riders', () => {
    const request = { authUser: { sub: 'rider-id', role: 'rider' } } as any;
    expect(() => controller.transferToCustomer(request, {
      tripId: '00000000-0000-4000-8000-000000000003',
      amountMinor: 100,
      consentConfirmed: true,
      idempotencyKey: '00000000-0000-4000-8000-000000000002',
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

  it('allows only admins to list all wallet movements', async () => {
    const adminRequest = { authUser: { sub: 'admin-id', role: 'admin' } } as any;
    dataSource.query.mockResolvedValue([{ id: 'tx-1' }]);
    await expect(controller.listAllTransactions(adminRequest)).resolves.toEqual([{ id: 'tx-1' }]);
    expect(dataSource.query).toHaveBeenCalledTimes(1);

    const riderRequest = { authUser: { sub: 'rider-id', role: 'rider' } } as any;
    await expect(controller.listAllTransactions(riderRequest)).rejects.toThrow(ForbiddenException);
  });

  it('rejects invalid transaction history limits', () => {
    const request = { authUser: { sub: 'rider-id', role: 'rider' } } as any;
    expect(() => controller.listTransactions(request, '101')).toThrow(BadRequestException);
  });
});
