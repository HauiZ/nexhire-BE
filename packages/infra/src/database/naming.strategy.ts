import { createHash } from 'crypto';
import { DefaultNamingStrategy, Table } from 'typeorm';

const POSTGRES_IDENTIFIER_LIMIT = 63;

function tableName(tableOrName: Table | string): string {
  return typeof tableOrName === 'string' ? tableOrName : tableOrName.name;
}

function cleanName(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function shortenName(value: string): string {
  const cleaned = cleanName(value);
  if (cleaned.length <= POSTGRES_IDENTIFIER_LIMIT) {
    return cleaned;
  }

  const hash = createHash('sha1').update(cleaned).digest('hex').slice(0, 8);
  const suffixLength = POSTGRES_IDENTIFIER_LIMIT - hash.length - 1;
  return `${cleaned.slice(0, suffixLength)}_${hash}`;
}

export class NexHireNamingStrategy extends DefaultNamingStrategy {
  primaryKeyName(tableOrName: Table | string, columnNames: string[]): string {
    return shortenName(`pk_${tableName(tableOrName)}_${columnNames.join('_')}`);
  }

  uniqueConstraintName(tableOrName: Table | string, columnNames: string[]): string {
    return shortenName(`uq_${tableName(tableOrName)}_${columnNames.join('_')}`);
  }

  foreignKeyName(
    tableOrName: Table | string,
    columnNames: string[],
    referencedTablePath?: string,
  ): string {
    const referencedTable = referencedTablePath ? `_${referencedTablePath}` : '';
    return shortenName(`fk_${tableName(tableOrName)}_${columnNames.join('_')}${referencedTable}`);
  }

  indexName(tableOrName: Table | string, columnNames: string[]): string {
    return shortenName(`idx_${tableName(tableOrName)}_${columnNames.join('_')}`);
  }

  relationConstraintName(tableOrName: Table | string, columnNames: string[]): string {
    return shortenName(`rel_${tableName(tableOrName)}_${columnNames.join('_')}`);
  }
}
