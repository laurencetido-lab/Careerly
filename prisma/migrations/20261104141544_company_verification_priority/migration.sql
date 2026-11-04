-- CreateEnum
CREATE TYPE "CompanyVerification" AS ENUM ('UNVERIFIED', 'VERIFIED', 'AMBIGUOUS', 'NOT_FOUND');

-- CreateEnum
CREATE TYPE "CompanyPriority" AS ENUM ('NONE', 'HIGH', 'MEDIUM', 'LOW', 'EXCLUDED');

-- AlterEnum
ALTER TYPE "ResearchScope" ADD VALUE 'VERIFY_COMPANIES';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "priority" "CompanyPriority" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "privateNotes" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifyNote" TEXT,
ADD COLUMN     "verifySource" TEXT,
ADD COLUMN     "verifyStatus" "CompanyVerification" NOT NULL DEFAULT 'UNVERIFIED';
