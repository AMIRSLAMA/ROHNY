import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController health', () => {
  let controller: AppController;
  let dataSource: { query: jest.Mock };
  let appService: { getHello: jest.Mock };

  beforeEach(() => {
    dataSource = { query: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    appService = { getHello: jest.fn(() => 'Hello World!') };
    controller = new AppController(
      appService as unknown as AppService,
      dataSource as unknown as DataSource,
    );
  });

  it('reports healthy only after PostgreSQL responds', async () => {
    await expect(controller.getHealth()).resolves.toEqual(expect.objectContaining({
      status: 'ok',
      service: 'ROHNY API',
      database: 'ok',
    }));
    expect(dataSource.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('returns service unavailable when PostgreSQL cannot be reached', async () => {
    dataSource.query.mockRejectedValueOnce(new Error('connection refused'));
    await expect(controller.getHealth()).rejects.toThrow(ServiceUnavailableException);
  });
});
