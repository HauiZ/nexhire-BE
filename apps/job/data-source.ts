import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '@nexhire/shared';

config();

export default new DataSource(buildDataSourceOptions('job_schema', __dirname));
