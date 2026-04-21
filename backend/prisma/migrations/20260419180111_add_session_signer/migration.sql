/*
  Warnings:

  - A unique constraint covering the columns `[sessionSigner]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sessionSigner" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_sessionSigner_key" ON "User"("sessionSigner");

-- CreateIndex
CREATE INDEX "User_sessionSigner_idx" ON "User"("sessionSigner");
