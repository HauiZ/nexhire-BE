import 'dotenv/config';

const { Client } = require('pg');

type ServiceConfig = {
  name: string;
  prefix: string;
};

type PgClient = InstanceType<typeof Client>;

const APPLY = process.env.TEST_FLOW_CLEANUP_APPLY === 'true';
const CLEANUP_RUN_ID = process.env.TEST_FLOW_CLEANUP_RUN_ID?.trim() || null;

const services = {
  application: { name: 'application-service', prefix: 'APPLICATION_SERVICE' },
  job: { name: 'job-service', prefix: 'JOB_SERVICE' },
  candidate: { name: 'candidate-service', prefix: 'CANDIDATE_SERVICE' },
  documentStorage: { name: 'document-storage-service', prefix: 'DOCUMENT_STORAGE_SERVICE' },
  company: { name: 'company-service', prefix: 'COMPANY_SERVICE' },
  auth: { name: 'auth-service', prefix: 'AUTH_SERVICE' },
  notification: { name: 'notification-service', prefix: 'NOTIFICATION_SERVICE' },
} satisfies Record<string, ServiceConfig>;

function log(message: string): void {
  console.log(message);
}

function dbConfig(service: ServiceConfig) {
  return {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? '5432'),
    database: process.env[`${service.prefix}_DB_NAME`],
    user: process.env[`${service.prefix}_DB_USER`],
    password: process.env[`${service.prefix}_DB_PASS`],
  };
}

async function withDb<T>(service: ServiceConfig, callback: (client: PgClient) => Promise<T>): Promise<T | null> {
  const config = dbConfig(service);
  if (!config.database || !config.user || !config.password) {
    log(`SKIP ${service.name}: missing ${service.prefix}_DB_NAME/USER/PASS`);
    return null;
  }

  const client = new Client(config);
  let connected = false;
  try {
    await client.connect();
    connected = true;
    await client.query('BEGIN');
    const result = await callback(client);
    APPLY ? await client.query('COMMIT') : await client.query('ROLLBACK');
    return result;
  } catch (error) {
    if (connected) {
      await client.query('ROLLBACK').catch(() => undefined);
    }
    const pgError = error as { code?: string; message?: string };
    if (pgError.code === '42P01') {
      log(`SKIP ${service.name}: table missing (${pgError.message})`);
      return null;
    }
    if (
      pgError.code === '28P01' ||
      pgError.code === '3D000' ||
      pgError.code === 'ECONNREFUSED' ||
      pgError.code === 'ETIMEDOUT' ||
      pgError.code === 'ENOTFOUND'
    ) {
      log(`SKIP ${service.name}: database connection failed (${describeDbError(error)})`);
      return null;
    }
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function ids(client: PgClient, sql: string, params: unknown[] = []): Promise<string[]> {
  const result = await client.query(sql, params);
  return result.rows.map((row: { id: string }) => row.id);
}

async function count(client: PgClient, sql: string, params: unknown[] = []): Promise<number> {
  const result = await client.query(sql, params);
  return Number(result.rows[0]?.count ?? 0);
}

async function del(client: PgClient, sql: string, params: unknown[] = []): Promise<number> {
  const result = await client.query(sql, params);
  return result.rowCount ?? 0;
}

function uuidArray(values: string[]): string[] {
  return values.length > 0 ? values : ['00000000-0000-0000-0000-000000000000'];
}

function line(label: string, value: number): void {
  log(`${APPLY ? 'DELETED' : 'DRY-RUN'} ${label}: ${value}`);
}

function describeDbError(error: unknown): string {
  const dbError = error as { message?: string; errors?: Array<{ message?: string }> };
  if (dbError.message) {
    return dbError.message;
  }

  const nestedMessage = dbError.errors?.map((nested) => nested.message).filter(Boolean).join('; ');
  return nestedMessage || 'unknown database connection error';
}

async function cleanupApplications(): Promise<string[]> {
  const applicationIds: string[] = [];

  await withDb(services.application, async (client) => {
    const runScopedParams = CLEANUP_RUN_ID
      ? [`Application Flow Job ${CLEANUP_RUN_ID}`, `Application flow test cover letter ${CLEANUP_RUN_ID}.`]
      : [];
    const apps = await ids(
      client,
      CLEANUP_RUN_ID
        ? `
          SELECT id
          FROM applications
          WHERE job_title = $1
             OR cover_letter = $2
        `
        : `
          SELECT id
          FROM applications
          WHERE job_title LIKE 'Application Flow Job %'
            OR cover_letter LIKE 'Application flow test cover letter %.'
            OR cover_letter = 'Application flow test cover letter.'
            OR status_note = 'Application flow test cleanup.'
        `,
      runScopedParams,
    );
    applicationIds.push(...apps);
    line('application-service.applications', apps.length);
    if (APPLY) {
      await del(client, 'DELETE FROM applications WHERE id = ANY($1::uuid[])', [uuidArray(apps)]);
    }
  });

  return applicationIds;
}

async function cleanupJobs(): Promise<string[]> {
  const jobIds: string[] = [];

  await withDb(services.job, async (client) => {
    const runScopedParams = CLEANUP_RUN_ID
      ? [
          `Backend Flow Job ${CLEANUP_RUN_ID}`,
          `Remote Risk Flow Job ${CLEANUP_RUN_ID}`,
          `Application Flow Job ${CLEANUP_RUN_ID}`,
          `NexHire Flow Company ${CLEANUP_RUN_ID}`,
          `Application Flow Company ${CLEANUP_RUN_ID}`,
        ]
      : [];
    const jobs = await ids(
      client,
      CLEANUP_RUN_ID
        ? `
          SELECT id
          FROM jobs
          WHERE title IN ($1, $2, $3)
             OR company_name IN ($4, $5)
        `
        : `
          SELECT id
          FROM jobs
          WHERE title LIKE 'Backend Flow Job %'
            OR title LIKE 'Remote Risk Flow Job %'
            OR title LIKE 'Application Flow Job %'
            OR company_name LIKE 'NexHire Flow Company %'
            OR company_name LIKE 'Application Flow Company %'
        `,
      runScopedParams,
    );
    jobIds.push(...jobs);

    const reviews = await count(
      client,
      `
        SELECT count(*)::int AS count
        FROM job_moderation_reviews
        WHERE job_id = ANY($1::uuid[]) OR target_id = ANY($1::uuid[])
      `,
      [uuidArray(jobs)],
    );
    const revisions = await count(
      client,
      CLEANUP_RUN_ID
        ? `
          SELECT count(*)::int AS count
          FROM job_revisions
          WHERE job_id = ANY($1::uuid[])
             OR title IN ($2, $3, $4)
        `
        : `
          SELECT count(*)::int AS count
          FROM job_revisions
          WHERE job_id = ANY($1::uuid[])
             OR title LIKE 'Backend Flow Job %'
             OR title LIKE 'Remote Risk Flow Job %'
             OR title LIKE 'Application Flow Job %'
        `,
      CLEANUP_RUN_ID
        ? [
            uuidArray(jobs),
            `Backend Flow Job ${CLEANUP_RUN_ID}`,
            `Remote Risk Flow Job ${CLEANUP_RUN_ID}`,
            `Application Flow Job ${CLEANUP_RUN_ID}`,
          ]
        : [uuidArray(jobs)],
    );

    line('job-service.job_moderation_reviews', reviews);
    line('job-service.job_revisions', revisions);
    line('job-service.jobs', jobs.length);

    if (APPLY) {
      await del(
        client,
        'DELETE FROM job_moderation_reviews WHERE job_id = ANY($1::uuid[]) OR target_id = ANY($1::uuid[])',
        [uuidArray(jobs)],
      );
      await del(
        client,
        CLEANUP_RUN_ID
          ? `
            DELETE FROM job_revisions
            WHERE job_id = ANY($1::uuid[])
               OR title IN ($2, $3, $4)
          `
          : `
            DELETE FROM job_revisions
            WHERE job_id = ANY($1::uuid[])
               OR title LIKE 'Backend Flow Job %'
               OR title LIKE 'Remote Risk Flow Job %'
               OR title LIKE 'Application Flow Job %'
          `,
        CLEANUP_RUN_ID
          ? [
              uuidArray(jobs),
              `Backend Flow Job ${CLEANUP_RUN_ID}`,
              `Remote Risk Flow Job ${CLEANUP_RUN_ID}`,
              `Application Flow Job ${CLEANUP_RUN_ID}`,
            ]
          : [uuidArray(jobs)],
      );
      await del(client, 'DELETE FROM jobs WHERE id = ANY($1::uuid[])', [uuidArray(jobs)]);
    }
  });

  return jobIds;
}

async function cleanupCandidates(): Promise<string[]> {
  const candidateIds: string[] = [];

  await withDb(services.candidate, async (client) => {
    const runScopedParams = CLEANUP_RUN_ID
      ? [
          `candidate-flow-${CLEANUP_RUN_ID}@nexhire.local`,
          `Candidate Flow CV ${CLEANUP_RUN_ID}`,
          `Application Flow CV ${CLEANUP_RUN_ID}`,
        ]
      : [];
    const candidates = await ids(
      client,
      CLEANUP_RUN_ID
        ? `
          SELECT id
          FROM candidate_profiles
          WHERE contact_email = $1
             OR id IN (
               SELECT candidate_id
               FROM candidate_cvs
               WHERE title IN ($2, $3)
             )
        `
        : `
          SELECT id
          FROM candidate_profiles
          WHERE contact_email LIKE 'candidate-flow-%@nexhire.local'
             OR id IN (
               SELECT candidate_id
               FROM candidate_cvs
               WHERE title LIKE 'Candidate Flow CV %'
                  OR title LIKE 'Application Flow CV %'
                  OR title IN ('Candidate Flow CV', 'Application Flow CV')
             )
        `,
      runScopedParams,
    );
    candidateIds.push(...candidates);

    const savedJobs = await count(client, 'SELECT count(*)::int AS count FROM saved_jobs WHERE candidate_id = ANY($1::uuid[])', [
      uuidArray(candidates),
    ]);
    const cvs = await count(client, 'SELECT count(*)::int AS count FROM candidate_cvs WHERE candidate_id = ANY($1::uuid[])', [
      uuidArray(candidates),
    ]);

    line('candidate-service.saved_jobs', savedJobs);
    line('candidate-service.candidate_cvs', cvs);
    line('candidate-service.candidate_profiles', candidates.length);

    if (APPLY) {
      const params = [uuidArray(candidates)];
      await del(client, 'DELETE FROM saved_jobs WHERE candidate_id = ANY($1::uuid[])', params);
      await del(client, 'DELETE FROM candidate_skills WHERE candidate_id = ANY($1::uuid[])', params);
      await del(client, 'DELETE FROM candidate_experiences WHERE candidate_id = ANY($1::uuid[])', params);
      await del(client, 'DELETE FROM candidate_educations WHERE candidate_id = ANY($1::uuid[])', params);
      await del(client, 'DELETE FROM candidate_certifications WHERE candidate_id = ANY($1::uuid[])', params);
      await del(client, 'DELETE FROM candidate_projects WHERE candidate_id = ANY($1::uuid[])', params);
      await del(client, 'DELETE FROM candidate_cvs WHERE candidate_id = ANY($1::uuid[])', params);
      await del(client, 'DELETE FROM candidate_profiles WHERE id = ANY($1::uuid[])', params);
    }
  });

  return candidateIds;
}

async function cleanupDocuments(): Promise<void> {
  await withDb(services.documentStorage, async (client) => {
    const runScopedParams = CLEANUP_RUN_ID
      ? [
          `application-flow-cv-${CLEANUP_RUN_ID}.pdf`,
          `candidate-flow-cv-${CLEANUP_RUN_ID}.pdf`,
          `document-flow-cv-${CLEANUP_RUN_ID}.pdf`,
          `candidate-avatar-${CLEANUP_RUN_ID}.png`,
        ]
      : [];
    const documents = await ids(
      client,
      CLEANUP_RUN_ID
        ? `
          SELECT id
          FROM documents
          WHERE file_name IN ($1, $2, $3, $4)
            AND (
              key LIKE '%/cv/%'
              OR key LIKE '%/avatar/%'
            )
        `
        : `
          SELECT id
          FROM documents
          WHERE (
            file_name LIKE 'application-flow-cv-%.pdf'
            OR file_name LIKE 'candidate-flow-cv-%.pdf'
            OR file_name LIKE 'document-flow-cv-%.pdf'
            OR file_name LIKE 'candidate-avatar-%.png'
            OR file_name IN (
              'application-flow-cv.pdf',
              'candidate-flow-cv.pdf',
              'candidate-avatar.png'
            )
          )
          AND (
            key LIKE '%/cv/%'
            OR key LIKE '%/avatar/%'
          )
        `,
      runScopedParams,
    );

    line('document-storage-service.documents', documents.length);
    if (APPLY) {
      await del(client, 'DELETE FROM documents WHERE id = ANY($1::uuid[])', [uuidArray(documents)]);
    }
  });
}

async function cleanupCompanies(): Promise<string[]> {
  const companyIds: string[] = [];

  await withDb(services.company, async (client) => {
    const runScopedParams = CLEANUP_RUN_ID
      ? [
          `NexHire Flow Company ${CLEANUP_RUN_ID}`,
          `Application Flow Company ${CLEANUP_RUN_ID}`,
          `FLOW${CLEANUP_RUN_ID}`,
          `APPFLOW${CLEANUP_RUN_ID}`,
        ]
      : [];
    const companies = await ids(
      client,
      CLEANUP_RUN_ID
        ? `
          SELECT id
          FROM companies
          WHERE name IN ($1, $2)
             OR tax_code IN ($3, $4)
        `
        : `
          SELECT id
          FROM companies
          WHERE name LIKE 'NexHire Flow Company %'
             OR name LIKE 'Application Flow Company %'
             OR tax_code LIKE 'FLOW%'
             OR tax_code LIKE 'APPFLOW%'
        `,
      runScopedParams,
    );
    companyIds.push(...companies);

    const trustHistories = await count(
      client,
      'SELECT count(*)::int AS count FROM company_trust_histories WHERE company_id = ANY($1::uuid[])',
      [uuidArray(companies)],
    );
    const trustSignals = await count(
      client,
      'SELECT count(*)::int AS count FROM company_processed_trust_signals WHERE company_id = ANY($1::uuid[])',
      [uuidArray(companies)],
    );

    line('company-service.company_trust_histories', trustHistories);
    line('company-service.company_processed_trust_signals', trustSignals);
    line('company-service.companies', companies.length);

    if (APPLY) {
      await del(client, 'DELETE FROM company_trust_histories WHERE company_id = ANY($1::uuid[])', [uuidArray(companies)]);
      await del(client, 'DELETE FROM company_processed_trust_signals WHERE company_id = ANY($1::uuid[])', [
        uuidArray(companies),
      ]);
      await del(client, 'DELETE FROM companies WHERE id = ANY($1::uuid[])', [uuidArray(companies)]);
    }
  });

  return companyIds;
}

async function cleanupAuth(): Promise<string[]> {
  const userIds: string[] = [];

  await withDb(services.auth, async (client) => {
    const runScopedParams = CLEANUP_RUN_ID
      ? [
          `auth-test-${CLEANUP_RUN_ID}@nexhire.local`,
          `candidate-test-${CLEANUP_RUN_ID}@nexhire.local`,
          `document-test-${CLEANUP_RUN_ID}@nexhire.local`,
          `flow-recruiter-${CLEANUP_RUN_ID}@nexhire.local`,
        ]
      : [];
    const users = await ids(
      client,
      CLEANUP_RUN_ID
        ? `
          SELECT id
          FROM users
          WHERE email IN ($1, $2, $3, $4)
        `
        : `
          SELECT id
          FROM users
          WHERE email LIKE 'auth-test-%@nexhire.local'
             OR email LIKE 'candidate-test-%@nexhire.local'
             OR email LIKE 'document-test-%@nexhire.local'
             OR email LIKE 'flow-recruiter-%@nexhire.local'
        `,
      runScopedParams,
    );
    userIds.push(...users);

    const companyLinks = await count(
      client,
      'SELECT count(*)::int AS count FROM recruiter_company_links WHERE user_id = ANY($1::uuid[])',
      [uuidArray(users)],
    );
    const roles = await count(client, 'SELECT count(*)::int AS count FROM user_roles WHERE user_id = ANY($1::uuid[])', [
      uuidArray(users),
    ]);
    const credentials = await count(
      client,
      'SELECT count(*)::int AS count FROM user_credentials WHERE user_id = ANY($1::uuid[])',
      [uuidArray(users)],
    );

    line('auth-service.recruiter_company_links', companyLinks);
    line('auth-service.user_roles', roles);
    line('auth-service.user_credentials', credentials);
    line('auth-service.users', users.length);

    if (APPLY) {
      const params = [uuidArray(users)];
      await del(client, 'DELETE FROM recruiter_company_links WHERE user_id = ANY($1::uuid[])', params);
      await del(client, 'DELETE FROM email_verifications WHERE user_id = ANY($1::uuid[])', params);
      await del(client, 'DELETE FROM password_reset_tokens WHERE user_id = ANY($1::uuid[])', params);
      await del(client, 'DELETE FROM user_credentials WHERE user_id = ANY($1::uuid[])', params);
      await del(client, 'DELETE FROM user_roles WHERE user_id = ANY($1::uuid[])', params);
      await del(client, 'DELETE FROM users WHERE id = ANY($1::uuid[])', params);
    }
  });

  return userIds;
}

async function cleanupNotifications(): Promise<void> {
  await withDb(services.notification, async (client) => {
    const runScopedParam = CLEANUP_RUN_ID ? [`%${CLEANUP_RUN_ID}%`] : [];
    const notifications = await ids(
      client,
      CLEANUP_RUN_ID
        ? `
          SELECT id
          FROM notifications
          WHERE title LIKE $1
             OR body LIKE $1
             OR data::text LIKE $1
        `
        : `
          SELECT id
          FROM notifications
          WHERE title LIKE '%Application Flow Job%'
             OR body LIKE '%Application Flow Job%'
             OR title LIKE '%Backend Flow Job%'
             OR body LIKE '%Backend Flow Job%'
             OR title LIKE '%Remote Risk Flow Job%'
             OR body LIKE '%Remote Risk Flow Job%'
             OR data::text LIKE '%Application Flow Job%'
             OR data::text LIKE '%Backend Flow Job%'
             OR data::text LIKE '%Remote Risk Flow Job%'
        `,
      runScopedParam,
    );

    line('notification-service.notifications', notifications.length);
    if (APPLY) {
      await del(client, 'DELETE FROM notifications WHERE id = ANY($1::uuid[])', [uuidArray(notifications)]);
    }
  });
}

async function main(): Promise<void> {
  log('TEST FLOW DATA CLEANUP');
  log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} (${APPLY ? 'deleting matching test data' : 'no data will be deleted'})`);
  log(`Scope: ${CLEANUP_RUN_ID ? `run ${CLEANUP_RUN_ID}` : 'all known flow-test markers'}`);
  log('');

  await cleanupNotifications();
  await cleanupApplications();
  await cleanupJobs();
  await cleanupCandidates();
  await cleanupDocuments();
  await cleanupCompanies();
  await cleanupAuth();

  log('');
  log(
    APPLY
      ? 'Cleanup applied. Object-storage files may still exist if MinIO does not expose matching delete cleanup.'
      : 'Dry-run complete. Set TEST_FLOW_CLEANUP_APPLY=true to delete the matching test data.',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
