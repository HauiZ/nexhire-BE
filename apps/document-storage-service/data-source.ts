import 'dotenv/config';
import { buildDataSourceOptions, databaseConfigFor } from '@nexhire/infra';

export default buildDataSourceOptions(databaseConfigFor('DOCUMENT_STORAGE_SERVICE')());
