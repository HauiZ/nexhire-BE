-- ==========================================
-- NEXHIRE COMPLETE SYSTEM DATABASE SCHEMA (PostgreSQL DDL)
-- Designed for graduation thesis defense (hội đồng)
-- Contains all tables, indexes, constraints, and custom enums.
-- ==========================================

-- ==========================================
-- 1. CUSTOM ENUM TYPES
-- ==========================================

-- Auth Service
CREATE TYPE user_status AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED', 'ARCHIVED');

-- Company Service
CREATE TYPE company_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
CREATE TYPE company_verification_document_type AS ENUM ('BUSINESS_REGISTRATION', 'TAX_CERTIFICATE', 'IDENTITY_PROOF', 'OTHER');
CREATE TYPE company_trust_level AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'VERIFIED');

-- Job Service
CREATE TYPE job_status AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'CLOSED', 'UNPUBLISHED');
CREATE TYPE employment_type AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE');
CREATE TYPE working_type AS ENUM ('REMOTE', 'ON_SITE', 'HYBRID');
CREATE TYPE experience_level AS ENUM ('INTERN', 'ENTRY', 'MID', 'SENIOR', 'LEAD', 'EXECUTIVE');
CREATE TYPE job_revision_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE job_moderation_review_target_type AS ENUM ('JOB', 'JOB_REVISION');
CREATE TYPE job_moderation_review_risk_level AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE job_moderation_review_decision AS ENUM ('APPROVED', 'REJECTED', 'FLAGGED');

-- Application Service
CREATE TYPE application_status AS ENUM ('SUBMITTED', 'REVIEWING', 'MATCHED', 'SHORTLISTED', 'INTERVIEWING', 'OFFERED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE cv_parse_status AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED');
CREATE TYPE application_progress_step AS ENUM ('SUBMITTED', 'MATCHED', 'UNDER_REVIEW', 'STAGE_UPDATED', 'DECISION_MADE', 'WITHDRAWN');
CREATE TYPE application_progress_actor_type AS ENUM ('CANDIDATE', 'RECRUITER', 'SYSTEM', 'AI');

-- CV Template Presets
CREATE TYPE cv_template_preset_status AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE cv_template_preset_category AS ENUM ('it', 'marketing', 'sales', 'hr');
CREATE TYPE cv_template_key AS ENUM ('modern', 'creative', 'professional', 'simple');

-- Document Storage Service
CREATE TYPE document_type AS ENUM ('AVATAR', 'LOGO', 'CV', 'COMPANY_DOC', 'HERO_IMAGE');
CREATE TYPE document_owner_type AS ENUM ('USER', 'CANDIDATE', 'COMPANY');

-- Matching Service
CREATE TYPE match_request_type AS ENUM ('AUTO_APPLICATION', 'RECRUITER_MANUAL', 'JOB_RESCAN', 'CV_RESCAN');
CREATE TYPE match_request_status AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE match_result_status AS ENUM ('SUCCEEDED', 'FAILED');
CREATE TYPE match_provider AS ENUM ('INTERNAL', 'SKIMA', 'GEMINI');

-- Notification Service
CREATE TYPE notification_recipient_type AS ENUM ('USER', 'COMPANY');
CREATE TYPE notification_sender_type AS ENUM ('USER', 'SYSTEM', 'COMPANY');
CREATE TYPE notification_type AS ENUM ('INFO', 'ALERT', 'APPLICATION_STATUS', 'MATCH_ALERT', 'CHAT');


-- ==========================================
-- 2. BASE TABLES (No Foreign Keys First)
-- ==========================================

-- Auth Service: users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(50),
    full_name VARCHAR(255),
    avatar_url VARCHAR(1000),
    avatar_document_id UUID,
    language VARCHAR(10) NOT NULL DEFAULT 'vi',
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    status user_status NOT NULL DEFAULT 'ACTIVE',
    status_reason VARCHAR(255),
    status_changed_by UUID,
    status_changed_at TIMESTAMPTZ,
    suspended_at TIMESTAMPTZ,
    banned_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auth Service: roles
CREATE TABLE roles (
    id VARCHAR(50) PRIMARY KEY,
    description VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Job Service: job_categories
CREATE TABLE job_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Document Storage Service: documents
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_type document_type NOT NULL,
    owner_type document_owner_type NOT NULL,
    owner_id UUID NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size INT NOT NULL,
    key VARCHAR(1000) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- Company Service: companies
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    logo VARCHAR(1000),
    logo_document_id UUID,
    description TEXT,
    industry VARCHAR(100),
    size VARCHAR(50),
    founded_year INT,
    mission TEXT,
    culture TEXT,
    values VARCHAR(255)[] NOT NULL DEFAULT '{}',
    perks VARCHAR(255)[] NOT NULL DEFAULT '{}',
    hero_image_url VARCHAR(1000),
    hero_image_document_id UUID,
    website VARCHAR(255),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    address VARCHAR(500),
    tax_code VARCHAR(100) NOT NULL UNIQUE,
    owner_id UUID NOT NULL,
    status company_status NOT NULL DEFAULT 'PENDING',
    status_reason TEXT,
    status_changed_at TIMESTAMPTZ,
    status_changed_by_user_id UUID,
    verification_rejected_count INT NOT NULL DEFAULT 0,
    last_verification_rejected_reason TEXT,
    last_verification_rejected_at TIMESTAMPTZ,
    verification_review_requested_at TIMESTAMPTZ,
    verification_review_requested_by_user_id UUID,
    approved_low_risk_count INT NOT NULL DEFAULT 0,
    negative_trust_signal_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- Candidate Service: cv_template_presets (Missing table added!)
CREATE TABLE cv_template_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(80) NOT NULL UNIQUE,
    name_i18n JSONB NOT NULL,
    description_i18n JSONB NOT NULL,
    categories cv_template_preset_category[] NOT NULL DEFAULT '{}',
    accent VARCHAR(32),
    thumbnail_url VARCHAR(1000),
    canvas JSONB NOT NULL,
    status cv_template_preset_status NOT NULL DEFAULT 'DRAFT',
    sort_order INT NOT NULL DEFAULT 0,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);


-- ==========================================
-- 3. DEPENDENT TABLES (With Foreign Keys & Indexes)
-- ==========================================

-- Auth Service: user_credentials
CREATE TABLE user_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_hash VARCHAR(255) NOT NULL,
    password_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    failed_login_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_credentials_user_id ON user_credentials(user_id);

-- Auth Service: user_roles
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id VARCHAR(50) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);

-- Auth Service: email_verifications
CREATE TABLE email_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resend_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_verifications_user_id ON email_verifications(user_id);

-- Auth Service: password_reset_tokens
CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resend_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);

-- Auth Service: auth_identities
CREATE TABLE auth_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_user_id VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    full_name VARCHAR(255),
    avatar_url VARCHAR(1000),
    linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, provider_user_id)
);

-- Auth Service: recruiter_company_links
CREATE TABLE recruiter_company_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    company_name VARCHAR(255),
    company_logo_url VARCHAR(1000),
    company_logo_document_id UUID,
    company_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_recruiter_company_links_user_id ON recruiter_company_links(user_id);
CREATE INDEX idx_recruiter_company_links_company_id ON recruiter_company_links(company_id);

-- Candidate Service: candidate_profiles
CREATE TABLE candidate_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255),
    phone VARCHAR(50),
    contact_email VARCHAR(255),
    avatar_document_id UUID,
    headline VARCHAR(255),
    summary TEXT,
    location VARCHAR(255),
    portfolio_url VARCHAR(255),
    linkedin_url VARCHAR(255),
    language VARCHAR(10) NOT NULL DEFAULT 'vi',
    open_to_work BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Candidate Service: candidate_skills
CREATE TABLE candidate_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES candidate_profiles(user_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    normalized_name VARCHAR(255) NOT NULL,
    years_of_experience INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_candidate_skills_candidate_id ON candidate_skills(candidate_id);

-- Candidate Service: candidate_experiences
CREATE TABLE candidate_experiences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES candidate_profiles(user_id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    position VARCHAR(255) NOT NULL,
    start_month INT,
    start_year INT,
    end_month INT,
    end_year INT,
    is_current BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_candidate_experiences_candidate_id ON candidate_experiences(candidate_id);

-- Candidate Service: candidate_educations
CREATE TABLE candidate_educations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES candidate_profiles(user_id) ON DELETE CASCADE,
    school_name VARCHAR(255) NOT NULL,
    degree VARCHAR(255),
    field_of_study VARCHAR(255),
    start_year INT,
    end_year INT,
    is_current BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_candidate_educations_candidate_id ON candidate_educations(candidate_id);

-- Candidate Service: candidate_certifications
CREATE TABLE candidate_certifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES candidate_profiles(user_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    issuer VARCHAR(255),
    credential_url VARCHAR(1000),
    issued_year INT,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_candidate_certifications_candidate_id ON candidate_certifications(candidate_id);

-- Candidate Service: candidate_projects
CREATE TABLE candidate_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES candidate_profiles(user_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    technologies VARCHAR(255)[] NOT NULL DEFAULT '{}',
    project_url VARCHAR(1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_candidate_projects_candidate_id ON candidate_projects(candidate_id);

-- Candidate Service: candidate_cvs
CREATE TABLE candidate_cvs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES candidate_profiles(user_id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    title VARCHAR(255),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    source_template_id UUID,
    source_cv_id UUID,
    parsed_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    document_deleted_at TIMESTAMPTZ,
    document_delete_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_candidate_cvs_candidate_id ON candidate_cvs(candidate_id);
CREATE INDEX idx_candidate_cvs_document_id ON candidate_cvs(document_id);

-- Candidate Service: candidate_cv_templates
CREATE TABLE candidate_cv_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES candidate_profiles(user_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    source_document_id UUID,
    source_document_deleted_at TIMESTAMPTZ,
    source_cv_id UUID,
    source_parse_request_id UUID,
    theme JSONB NOT NULL DEFAULT '{}',
    layout JSONB NOT NULL DEFAULT '{}',
    content_snapshot JSONB NOT NULL DEFAULT '{}',
    canvas JSONB NOT NULL DEFAULT '{}',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    last_exported_cv_id UUID,
    last_exported_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_candidate_cv_templates_candidate_id ON candidate_cv_templates(candidate_id);

-- Company Service: company_verification_documents
CREATE TABLE company_verification_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    type company_verification_document_type NOT NULL,
    uploaded_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_comp_ver_docs_company_id ON company_verification_documents(company_id);

-- Company Service: company_trust_histories
CREATE TABLE company_trust_histories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    changed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reason VARCHAR(500) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comp_trust_hist_company_id ON company_trust_histories(company_id);

-- Company Service: company_processed_trust_signals
CREATE TABLE company_processed_trust_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    target_type VARCHAR(100) NOT NULL,
    target_id UUID NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comp_trust_signals_company_id ON company_processed_trust_signals(company_id);

-- Job Service: company_posting_snapshots
CREATE TABLE company_posting_snapshots (
    company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    company_name VARCHAR(255),
    company_logo_url VARCHAR(1000),
    company_logo_document_id UUID,
    company_status company_status NOT NULL,
    company_trust_level company_trust_level NOT NULL,
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Job Service: jobs
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    company_name VARCHAR(255),
    company_logo_url VARCHAR(1000),
    company_logo_document_id UUID,
    company_snapshot_at TIMESTAMPTZ NOT NULL,
    created_by_user_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    requirements TEXT,
    skills VARCHAR(255)[] NOT NULL DEFAULT '{}',
    benefits TEXT,
    category_id UUID REFERENCES job_categories(id) ON DELETE SET NULL,
    location VARCHAR(255),
    salary_min INT,
    salary_max INT,
    salary_currency VARCHAR(10) NOT NULL DEFAULT 'VND',
    is_salary_visible BOOLEAN NOT NULL DEFAULT TRUE,
    deadline TIMESTAMPTZ,
    number_of_openings INT,
    status job_status NOT NULL DEFAULT 'DRAFT',
    employment_type employment_type,
    working_type working_type,
    experience_level experience_level,
    version INT NOT NULL DEFAULT 1,
    application_count INT NOT NULL DEFAULT 0,
    published_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    risk_score INT,
    moderation_reasons VARCHAR(255)[] NOT NULL DEFAULT '{}',
    moderation_matched_rules VARCHAR(255)[] NOT NULL DEFAULT '{}',
    reviewed_by_user_id UUID,
    reviewed_at TIMESTAMPTZ,
    review_reason TEXT,
    unpublished_by_user_id UUID,
    unpublished_at TIMESTAMPTZ,
    unpublish_reason TEXT,
    search_title VARCHAR(255) NOT NULL DEFAULT '',
    search_description TEXT NOT NULL DEFAULT '',
    search_requirements TEXT NOT NULL DEFAULT '',
    search_skills TEXT NOT NULL DEFAULT '',
    search_company_name VARCHAR(255) NOT NULL DEFAULT '',
    search_location VARCHAR(255) NOT NULL DEFAULT '',
    search_text TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_jobs_company_id ON jobs(company_id);
CREATE INDEX idx_jobs_category_id ON jobs(category_id);
CREATE INDEX idx_jobs_status ON jobs(status);

-- Job Service: job_revisions
CREATE TABLE job_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    created_by_user_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    requirements TEXT,
    skills VARCHAR(255)[] NOT NULL DEFAULT '{}',
    benefits TEXT,
    category_id UUID REFERENCES job_categories(id) ON DELETE SET NULL,
    location VARCHAR(255),
    salary_min INT,
    salary_max INT,
    salary_currency VARCHAR(10) NOT NULL DEFAULT 'VND',
    is_salary_visible BOOLEAN NOT NULL DEFAULT TRUE,
    deadline TIMESTAMPTZ,
    number_of_openings INT,
    status job_revision_status NOT NULL DEFAULT 'PENDING',
    change_summary TEXT,
    risk_score INT,
    moderation_reasons VARCHAR(255)[] NOT NULL DEFAULT '{}',
    moderation_matched_rules VARCHAR(255)[] NOT NULL DEFAULT '{}',
    reviewed_by_user_id UUID,
    reviewed_at TIMESTAMPTZ,
    review_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_job_revisions_job_id ON job_revisions(job_id);

-- Job Service: job_moderation_reviews
CREATE TABLE job_moderation_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    target_type job_moderation_review_target_type NOT NULL,
    target_id UUID NOT NULL,
    risk_score INT NOT NULL DEFAULT 0,
    risk_level job_moderation_review_risk_level NOT NULL,
    decision job_moderation_review_decision NOT NULL,
    reasons VARCHAR(255)[] NOT NULL DEFAULT '{}',
    matched_rules VARCHAR(255)[] NOT NULL DEFAULT '{}',
    reviewed_by_user_id UUID,
    reviewed_at TIMESTAMPTZ,
    admin_decision VARCHAR(50),
    admin_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_job_mod_reviews_job_id ON job_moderation_reviews(job_id);

-- Job Service: job_processed_application_events
CREATE TABLE job_processed_application_events (
    application_id UUID PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Candidate Service: saved_jobs
CREATE TABLE saved_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES candidate_profiles(user_id) ON DELETE CASCADE,
    candidate_user_id UUID NOT NULL,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    job_title VARCHAR(255) NOT NULL,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    company_name VARCHAR(255),
    company_logo_url VARCHAR(1000),
    company_logo_document_id UUID,
    location VARCHAR(255),
    salary_min INT,
    salary_max INT,
    salary_currency VARCHAR(10) NOT NULL DEFAULT 'VND',
    is_salary_visible BOOLEAN NOT NULL DEFAULT TRUE,
    deadline TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_saved_jobs_candidate_id ON saved_jobs(candidate_id);

-- Candidate Service: followed_companies
CREATE TABLE followed_companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES candidate_profiles(user_id) ON DELETE CASCADE,
    candidate_user_id UUID NOT NULL,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    company_logo_url VARCHAR(1000),
    company_logo_document_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_followed_companies_candidate_id ON followed_companies(candidate_id);

-- Application Service: applications
CREATE TABLE applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
    job_title VARCHAR(255) NOT NULL,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    company_name VARCHAR(255),
    company_logo_url VARCHAR(1000),
    company_logo_document_id UUID,
    candidate_id UUID NOT NULL REFERENCES candidate_profiles(user_id) ON DELETE RESTRICT,
    candidate_user_id UUID NOT NULL,
    candidate_full_name VARCHAR(255),
    candidate_email VARCHAR(255),
    candidate_phone VARCHAR(50),
    candidate_avatar_document_id UUID,
    candidate_cv_id UUID NOT NULL REFERENCES candidate_cvs(id) ON DELETE RESTRICT,
    cv_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    cv_title VARCHAR(255),
    cv_file_name VARCHAR(255) NOT NULL,
    cv_mime_type VARCHAR(100) NOT NULL,
    cv_size INT NOT NULL,
    cv_parse_status cv_parse_status NOT NULL DEFAULT 'PENDING',
    cover_letter TEXT,
    status application_status NOT NULL DEFAULT 'SUBMITTED',
    status_note TEXT,
    match_score INT,
    match_level VARCHAR(50),
    auto_match_requested BOOLEAN NOT NULL DEFAULT FALSE,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    withdrawn_at TIMESTAMPTZ,
    decided_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    first_cv_received_at TIMESTAMPTZ,
    first_cv_viewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_applications_job_id ON applications(job_id);
CREATE INDEX idx_applications_candidate_id ON applications(candidate_id);

-- Application Service: application_progress_events
CREATE TABLE application_progress_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    step application_progress_step NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    actor_type application_progress_actor_type NOT NULL,
    actor_user_id UUID,
    note TEXT,
    metadata JSONB,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_app_prog_events_app_id ON application_progress_events(application_id);

-- CV Parsing Service: cv_parse_requests
CREATE TABLE cv_parse_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES candidate_profiles(user_id) ON DELETE CASCADE,
    requested_by_user_id UUID NOT NULL,
    candidate_cv_id UUID REFERENCES candidate_cvs(id) ON DELETE SET NULL,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    document_url VARCHAR(1000),
    status cv_parse_status NOT NULL DEFAULT 'PENDING',
    provider_version VARCHAR(50),
    content_hash VARCHAR(64),
    error_code VARCHAR(100),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cv_parse_requests_candidate_id ON cv_parse_requests(candidate_id);

-- CV Parsing Service: cv_parse_results
CREATE TABLE cv_parse_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parse_request_id UUID NOT NULL REFERENCES cv_parse_requests(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES candidate_profiles(user_id) ON DELETE CASCADE,
    candidate_cv_id UUID REFERENCES candidate_cvs(id) ON DELETE SET NULL,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    provider_version VARCHAR(50),
    normalized_payload JSONB NOT NULL,
    raw_provider_payload JSONB,
    confidence JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cv_parse_results_request_id ON cv_parse_results(parse_request_id);

-- CV Parsing Service: ai_usage_logs
CREATE TABLE ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parse_request_id UUID NOT NULL REFERENCES cv_parse_requests(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES candidate_profiles(user_id) ON DELETE CASCADE,
    candidate_cv_id UUID REFERENCES candidate_cvs(id) ON DELETE SET NULL,
    model VARCHAR(100) NOT NULL,
    operation VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    latency_ms INT,
    input_tokens INT,
    output_tokens INT,
    total_tokens INT,
    estimated_cost_usd VARCHAR(50),
    error_code VARCHAR(100),
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Matching Service: match_requests (Python SQLAlchemy model table added!)
CREATE TABLE match_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES candidate_profiles(user_id) ON DELETE CASCADE,
    candidate_user_id UUID,
    candidate_cv_id UUID REFERENCES candidate_cvs(id) ON DELETE SET NULL,
    cv_document_id UUID REFERENCES documents(id) ON DELETE RESTRICT,
    parsed_resume JSONB,
    request_type match_request_type NOT NULL,
    status match_request_status NOT NULL DEFAULT 'PENDING',
    priority INT NOT NULL DEFAULT 100,
    attempt_count INT NOT NULL DEFAULT 0,
    last_error_code VARCHAR(120),
    last_error_message TEXT,
    requested_by_user_id UUID,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_match_requests_status_priority_created_at ON match_requests(status, priority, created_at);
CREATE INDEX idx_match_requests_application_id ON match_requests(application_id);
CREATE INDEX idx_match_requests_job_id ON match_requests(job_id);

-- Matching Service: match_results
CREATE TABLE match_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES match_requests(id) ON DELETE SET NULL,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES candidate_profiles(user_id) ON DELETE CASCADE,
    candidate_cv_id UUID REFERENCES candidate_cvs(id) ON DELETE SET NULL,
    application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
    status match_result_status NOT NULL DEFAULT 'SUCCEEDED',
    provider match_provider NOT NULL DEFAULT 'INTERNAL',
    model_version VARCHAR(80),
    total_score FLOAT NOT NULL,
    skill_score FLOAT NOT NULL DEFAULT 0,
    experience_score FLOAT NOT NULL DEFAULT 0,
    education_score FLOAT NOT NULL DEFAULT 0,
    certification_score FLOAT NOT NULL DEFAULT 0,
    project_score FLOAT NOT NULL DEFAULT 0,
    preference_score FLOAT NOT NULL DEFAULT 0,
    semantic_score FLOAT NOT NULL DEFAULT 0,
    explanation JSONB NOT NULL,
    error_code VARCHAR(120),
    error_message TEXT,
    matching_completed_published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_match_results_job_id ON match_results(job_id);
CREATE INDEX idx_match_results_candidate_id ON match_results(candidate_id);
CREATE INDEX idx_match_results_application_id ON match_results(application_id);

-- Notification Service: notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_type notification_recipient_type NOT NULL,
    recipient_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    recipient_company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    dedupe_key VARCHAR(255) NOT NULL,
    sender_type notification_sender_type NOT NULL DEFAULT 'SYSTEM',
    sender_entity_id UUID,
    sender_name VARCHAR(255),
    sender_avatar_document_id UUID,
    sender_logo_url VARCHAR(1000),
    type notification_type NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_recipient_user ON notifications(recipient_user_id);
