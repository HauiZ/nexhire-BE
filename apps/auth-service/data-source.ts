import 'dotenv/config';
import { buildDataSourceOptions, databaseConfigFor } from '@nexhire/infra';

export default buildDataSourceOptions(databaseConfigFor('AUTH_SERVICE')());
