-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO', 'TEAM', 'UNIVERSITY');

-- CreateEnum
CREATE TYPE "UsageKind" AS ENUM ('SEARCH', 'EXTRACT', 'LLM');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('CV', 'SPREADSHEET', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('COMPANY', 'OPPORTUNITY', 'GENERIC');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('TEXT', 'LONG_TEXT', 'NUMBER', 'CURRENCY', 'PERCENT', 'DATE', 'BOOLEAN', 'SINGLE_SELECT', 'MULTI_SELECT', 'URL', 'EMAIL', 'FORMULA', 'AI_RESEARCH', 'SOURCE_REF', 'RELATION');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('VERIFIED', 'REPORTED', 'ESTIMATED', 'CONFLICTING', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ValueOrigin" AS ENUM ('IMPORT', 'MANUAL', 'RESEARCH');

-- CreateEnum
CREATE TYPE "OpportunityPipeline" AS ENUM ('GRADUATE_PROGRAMME', 'INTERNSHIP', 'PERMANENT', 'OTHER');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('VERIFIED_OPEN', 'PREVIOUSLY_OPEN_UNKNOWN', 'CONFIRMED_CLOSED', 'EXPECTED_UNCONFIRMED');

-- CreateEnum
CREATE TYPE "ContactStage" AS ENUM ('DISCOVERED', 'SHORTLISTED', 'MESSAGE_DRAFTED', 'CONTACTED', 'RESPONDED', 'CALL_SCHEDULED', 'CALL_COMPLETED', 'FOLLOW_UP', 'REFERRAL');

-- CreateEnum
CREATE TYPE "CompSourceType" AS ENUM ('OFFICIAL', 'EMPLOYEE_REPORTED', 'MARKET_ESTIMATE', 'USER_NETWORKING', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ResearchScope" AS ENUM ('CELL', 'ROW', 'ROWS', 'COLUMN', 'DATASET', 'DISCOVER_COMPANIES', 'DISCOVER_CONTACTS', 'DISCOVER_OPPORTUNITIES');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "monthlyCredits" INTEGER NOT NULL DEFAULT 500,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "networkingLanguage" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "dateFormat" TEXT NOT NULL DEFAULT 'dd/MM/yyyy',
    "aiConsentAt" TIMESTAMP(3),
    "emailNotifications" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "workspaceId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "ip" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "jobId" TEXT,
    "kind" "UsageKind" NOT NULL,
    "provider" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL DEFAULT '',
    "targetLocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "searchLanguages" TEXT[] DEFAULT ARRAY['en']::TEXT[],
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "headline" TEXT,
    "graduationDate" TIMESTAMP(3),
    "availability" TEXT,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredLocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "careerInterests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "achievements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cvFileId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileEducation" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "degree" TEXT,
    "field" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProfileEducation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileExperience" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "employer" TEXT NOT NULL,
    "title" TEXT,
    "location" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "summary" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProfileExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadedFile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "kind" "FileKind" NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadedFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'OTHER',
    "version" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dataset" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL DEFAULT 'COMPANY',
    "sourceFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldDefinition" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FieldType" NOT NULL,
    "valueType" "FieldType",
    "position" INTEGER NOT NULL DEFAULT 0,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "width" INTEGER NOT NULL DEFAULT 180,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currency" TEXT,
    "formula" TEXT,
    "coreBinding" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "researchPrompt" TEXT,
    "sourceColumn" TEXT,
    "relationDataset" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetRow" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "companyId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "importKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DatasetRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldValue" (
    "id" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "textValue" TEXT,
    "numberValue" DOUBLE PRECISION,
    "dateValue" TIMESTAMP(3),
    "boolValue" BOOLEAN,
    "listValue" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currency" TEXT,
    "origin" "ValueOrigin" NOT NULL DEFAULT 'MANUAL',
    "confidence" "Confidence",
    "manuallyConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "researchedAt" TIMESTAMP(3),
    "researchJobId" TEXT,
    "researchNotes" TEXT,
    "suggestionText" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldValueHistory" (
    "id" TEXT NOT NULL,
    "fieldValueId" TEXT NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT,
    "previousConfidence" "Confidence",
    "newConfidence" "Confidence",
    "origin" "ValueOrigin" NOT NULL,
    "reason" TEXT,
    "researchJobId" TEXT,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldValueHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "website" TEXT,
    "domain" TEXT,
    "headquarters" TEXT,
    "industry" TEXT,
    "description" TEXT,
    "matchReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "companyId" TEXT,
    "title" TEXT NOT NULL,
    "department" TEXT,
    "location" TEXT,
    "employmentType" TEXT,
    "pipeline" "OpportunityPipeline" NOT NULL DEFAULT 'PERMANENT',
    "seniority" TEXT,
    "description" TEXT,
    "qualifications" TEXT,
    "startDate" TEXT,
    "deadline" TIMESTAMP(3),
    "salaryText" TEXT,
    "bonusText" TEXT,
    "applicationUrl" TEXT,
    "sourceUrl" TEXT,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'PREVIOUSLY_OPEN_UNKNOWN',
    "relevance" TEXT,
    "conversionEvidence" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "origin" "ValueOrigin" NOT NULL DEFAULT 'MANUAL',
    "firstDiscoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "companyId" TEXT,
    "fullName" TEXT NOT NULL,
    "title" TEXT,
    "team" TEXT,
    "location" TEXT,
    "profileUrl" TEXT,
    "sourceUrl" TEXT,
    "sourceExcerpt" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "recommendationReason" TEXT,
    "relevanceScore" INTEGER NOT NULL DEFAULT 0,
    "alumniOf" TEXT,
    "isRecruiter" BOOLEAN NOT NULL DEFAULT false,
    "stage" "ContactStage" NOT NULL DEFAULT 'DISCOVERED',
    "origin" "ValueOrigin" NOT NULL DEFAULT 'MANUAL',
    "privateNotes" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkingInteraction" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" TEXT,
    "salaryInsight" TEXT,
    "recruitmentInsight" TEXT,
    "careerInsight" TEXT,
    "nextAction" TEXT,
    "followUpAt" TIMESTAMP(3),
    "followUpDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NetworkingInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageDraft" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "generatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineStage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "terminal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "companyId" TEXT,
    "opportunityId" TEXT,
    "recruiterId" TEXT,
    "role" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'RESEARCHING',
    "applicationUrl" TEXT,
    "appliedAt" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "cvVersion" TEXT,
    "coverLetter" TEXT,
    "tests" TEXT,
    "feedback" TEXT,
    "compensationNote" TEXT,
    "nextAction" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "round" TEXT NOT NULL,
    "format" TEXT,
    "questions" TEXT,
    "preparedAnswers" TEXT,
    "notes" TEXT,
    "feedback" TEXT,
    "prepProgress" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompensationRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "companyId" TEXT,
    "roleTitle" TEXT NOT NULL,
    "seniority" TEXT NOT NULL,
    "city" TEXT,
    "country" TEXT,
    "year" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "baseSalary" DOUBLE PRECISION,
    "targetBonus" DOUBLE PRECISION,
    "actualBonus" DOUBLE PRECISION,
    "signingBonus" DOUBLE PRECISION,
    "longTermIncentive" TEXT,
    "carriedInterest" TEXT,
    "sourceType" "CompSourceType" NOT NULL,
    "confidence" "Confidence" NOT NULL DEFAULT 'UNKNOWN',
    "sourceUrl" TEXT,
    "notes" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompensationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchPlan" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "datasetId" TEXT,
    "createdById" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "scope" "ResearchScope" NOT NULL,
    "rowIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "companyId" TEXT,
    "maxResults" INTEGER NOT NULL DEFAULT 10,
    "estimatedCredits" INTEGER NOT NULL DEFAULT 0,
    "budgetCredits" INTEGER NOT NULL DEFAULT 0,
    "generatedBy" TEXT NOT NULL DEFAULT 'TEMPLATE',
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchPlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "fieldId" TEXT,
    "instruction" TEXT NOT NULL,
    "queries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ResearchPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "planId" TEXT,
    "monitoringRuleId" TEXT,
    "createdById" TEXT NOT NULL,
    "scope" "ResearchScope" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "totalTasks" INTEGER NOT NULL DEFAULT 0,
    "completedTasks" INTEGER NOT NULL DEFAULT 0,
    "failedTasks" INTEGER NOT NULL DEFAULT 0,
    "budgetCredits" INTEGER NOT NULL DEFAULT 0,
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchTask" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "rowId" TEXT,
    "fieldId" TEXT,
    "query" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "result" TEXT,
    "error" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchLog" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchSource" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "title" TEXT,
    "publishedAt" TIMESTAMP(3),
    "tier" INTEGER NOT NULL DEFAULT 5,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchEvidence" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fieldValueId" TEXT,
    "opportunityId" TEXT,
    "contactId" TEXT,
    "companyId" TEXT,
    "sourceId" TEXT NOT NULL,
    "value" TEXT,
    "excerpt" TEXT NOT NULL,
    "confidence" "Confidence" NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "researchJobId" TEXT,
    "notes" TEXT,
    "origin" "ValueOrigin" NOT NULL DEFAULT 'RESEARCH',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchCache" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "queryHash" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "results" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageCache" (
    "id" TEXT NOT NULL,
    "urlHash" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringModel" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoringModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringCriterion" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "direction" TEXT NOT NULL DEFAULT 'HIGHER',
    "constraintType" TEXT NOT NULL DEFAULT 'NONE',
    "constraintValue" TEXT,

    CONSTRAINT "ScoringCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fieldIds" TEXT[],
    "frequency" "Frequency" NOT NULL DEFAULT 'WEEKLY',
    "intervalDays" INTEGER NOT NULL DEFAULT 7,
    "creditCapPerRun" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitoringRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageRecord_userId_createdAt_idx" ON "UsageRecord"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageRecord_jobId_idx" ON "UsageRecord"("jobId");

-- CreateIndex
CREATE INDEX "Workspace_ownerId_idx" ON "Workspace"("ownerId");

-- CreateIndex
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UploadedFile_storageKey_key" ON "UploadedFile"("storageKey");

-- CreateIndex
CREATE INDEX "UploadedFile_workspaceId_idx" ON "UploadedFile"("workspaceId");

-- CreateIndex
CREATE INDEX "Document_workspaceId_idx" ON "Document"("workspaceId");

-- CreateIndex
CREATE INDEX "Dataset_workspaceId_idx" ON "Dataset"("workspaceId");

-- CreateIndex
CREATE INDEX "FieldDefinition_datasetId_position_idx" ON "FieldDefinition"("datasetId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "FieldDefinition_datasetId_key_key" ON "FieldDefinition"("datasetId", "key");

-- CreateIndex
CREATE INDEX "DatasetRow_datasetId_position_idx" ON "DatasetRow"("datasetId", "position");

-- CreateIndex
CREATE INDEX "DatasetRow_companyId_idx" ON "DatasetRow"("companyId");

-- CreateIndex
CREATE INDEX "FieldValue_fieldId_numberValue_idx" ON "FieldValue"("fieldId", "numberValue");

-- CreateIndex
CREATE INDEX "FieldValue_fieldId_dateValue_idx" ON "FieldValue"("fieldId", "dateValue");

-- CreateIndex
CREATE UNIQUE INDEX "FieldValue_rowId_fieldId_key" ON "FieldValue"("rowId", "fieldId");

-- CreateIndex
CREATE INDEX "FieldValueHistory_fieldValueId_createdAt_idx" ON "FieldValueHistory"("fieldValueId", "createdAt");

-- CreateIndex
CREATE INDEX "SavedView_datasetId_userId_idx" ON "SavedView"("datasetId", "userId");

-- CreateIndex
CREATE INDEX "Company_workspaceId_domain_idx" ON "Company"("workspaceId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "Company_workspaceId_normalizedName_key" ON "Company"("workspaceId", "normalizedName");

-- CreateIndex
CREATE INDEX "Opportunity_workspaceId_deadline_idx" ON "Opportunity"("workspaceId", "deadline");

-- CreateIndex
CREATE INDEX "Opportunity_companyId_idx" ON "Opportunity"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_workspaceId_dedupeKey_key" ON "Opportunity"("workspaceId", "dedupeKey");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_stage_idx" ON "Contact"("workspaceId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_workspaceId_dedupeKey_key" ON "Contact"("workspaceId", "dedupeKey");

-- CreateIndex
CREATE INDEX "NetworkingInteraction_workspaceId_followUpAt_idx" ON "NetworkingInteraction"("workspaceId", "followUpAt");

-- CreateIndex
CREATE INDEX "NetworkingInteraction_contactId_idx" ON "NetworkingInteraction"("contactId");

-- CreateIndex
CREATE INDEX "MessageDraft_contactId_idx" ON "MessageDraft"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineStage_workspaceId_key_key" ON "PipelineStage"("workspaceId", "key");

-- CreateIndex
CREATE INDEX "Application_workspaceId_stage_idx" ON "Application"("workspaceId", "stage");

-- CreateIndex
CREATE INDEX "CompensationRecord_workspaceId_currency_year_idx" ON "CompensationRecord"("workspaceId", "currency", "year");

-- CreateIndex
CREATE INDEX "ResearchPlan_workspaceId_createdAt_idx" ON "ResearchPlan"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ResearchJob_workspaceId_createdAt_idx" ON "ResearchJob"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ResearchTask_jobId_status_idx" ON "ResearchTask"("jobId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchTask_jobId_rowId_fieldId_query_key" ON "ResearchTask"("jobId", "rowId", "fieldId", "query");

-- CreateIndex
CREATE INDEX "ResearchLog_jobId_createdAt_idx" ON "ResearchLog"("jobId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchSource_url_key" ON "ResearchSource"("url");

-- CreateIndex
CREATE INDEX "ResearchEvidence_fieldValueId_idx" ON "ResearchEvidence"("fieldValueId");

-- CreateIndex
CREATE INDEX "ResearchEvidence_workspaceId_createdAt_idx" ON "ResearchEvidence"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SearchCache_provider_queryHash_key" ON "SearchCache"("provider", "queryHash");

-- CreateIndex
CREATE UNIQUE INDEX "PageCache_urlHash_key" ON "PageCache"("urlHash");

-- CreateIndex
CREATE INDEX "ScoringModel_workspaceId_idx" ON "ScoringModel"("workspaceId");

-- CreateIndex
CREATE INDEX "MonitoringRule_enabled_nextRunAt_idx" ON "MonitoringRule"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileEducation" ADD CONSTRAINT "ProfileEducation_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileExperience" ADD CONSTRAINT "ProfileExperience_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "UploadedFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dataset" ADD CONSTRAINT "Dataset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dataset" ADD CONSTRAINT "Dataset_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "UploadedFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldDefinition" ADD CONSTRAINT "FieldDefinition_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetRow" ADD CONSTRAINT "DatasetRow_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetRow" ADD CONSTRAINT "DatasetRow_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldValue" ADD CONSTRAINT "FieldValue_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "DatasetRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldValue" ADD CONSTRAINT "FieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "FieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldValueHistory" ADD CONSTRAINT "FieldValueHistory_fieldValueId_fkey" FOREIGN KEY ("fieldValueId") REFERENCES "FieldValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkingInteraction" ADD CONSTRAINT "NetworkingInteraction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkingInteraction" ADD CONSTRAINT "NetworkingInteraction_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageDraft" ADD CONSTRAINT "MessageDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageDraft" ADD CONSTRAINT "MessageDraft_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRecord" ADD CONSTRAINT "CompensationRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRecord" ADD CONSTRAINT "CompensationRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchPlan" ADD CONSTRAINT "ResearchPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchPlan" ADD CONSTRAINT "ResearchPlan_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchPlanItem" ADD CONSTRAINT "ResearchPlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ResearchPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchPlanItem" ADD CONSTRAINT "ResearchPlanItem_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "FieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchJob" ADD CONSTRAINT "ResearchJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchJob" ADD CONSTRAINT "ResearchJob_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ResearchPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchTask" ADD CONSTRAINT "ResearchTask_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ResearchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchTask" ADD CONSTRAINT "ResearchTask_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "DatasetRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchLog" ADD CONSTRAINT "ResearchLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ResearchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchEvidence" ADD CONSTRAINT "ResearchEvidence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchEvidence" ADD CONSTRAINT "ResearchEvidence_fieldValueId_fkey" FOREIGN KEY ("fieldValueId") REFERENCES "FieldValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchEvidence" ADD CONSTRAINT "ResearchEvidence_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchEvidence" ADD CONSTRAINT "ResearchEvidence_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ResearchSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringModel" ADD CONSTRAINT "ScoringModel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringModel" ADD CONSTRAINT "ScoringModel_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringCriterion" ADD CONSTRAINT "ScoringCriterion_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ScoringModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringCriterion" ADD CONSTRAINT "ScoringCriterion_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "FieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringRule" ADD CONSTRAINT "MonitoringRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringRule" ADD CONSTRAINT "MonitoringRule_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
