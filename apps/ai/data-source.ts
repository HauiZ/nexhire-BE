import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '@nexhire/infra';

config();

export default new DataSource(buildDataSourceOptions(__dirname, 'AI'));
