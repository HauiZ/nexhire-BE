import 'dotenv/config';
import { buildDataSourceOptions } from '@nexhire/infra';
import { DataSource } from 'typeorm';

export default new DataSource(buildDataSourceOptions(__dirname, 'CV_PARSING_SERVICE'));
