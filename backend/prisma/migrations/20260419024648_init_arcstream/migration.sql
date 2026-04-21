-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "eoaAddress" TEXT NOT NULL,
    "dcwAddress" TEXT NOT NULL,
    "circleWalletId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "hlsManifestUrl" TEXT NOT NULL,
    "hlsBaseUrl" TEXT,
    "pricePerSession" DECIMAL(10,6) NOT NULL,
    "sessionDuration" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "creatorAddress" TEXT NOT NULL,
    "creatorDcw" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "sessionIndex" INTEGER NOT NULL,
    "txHash" TEXT,
    "amount" DECIMAL(10,6) NOT NULL,
    "nonce" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PaymentStatus" NOT NULL DEFAULT 'VERIFIED',

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_eoaAddress_key" ON "User"("eoaAddress");

-- CreateIndex
CREATE UNIQUE INDEX "User_dcwAddress_key" ON "User"("dcwAddress");

-- CreateIndex
CREATE INDEX "User_eoaAddress_idx" ON "User"("eoaAddress");

-- CreateIndex
CREATE INDEX "User_dcwAddress_idx" ON "User"("dcwAddress");

-- CreateIndex
CREATE INDEX "Video_creatorAddress_idx" ON "Video"("creatorAddress");

-- CreateIndex
CREATE INDEX "Video_createdAt_id_idx" ON "Video"("createdAt", "id");

-- CreateIndex
CREATE INDEX "Payment_userId_videoId_timestamp_idx" ON "Payment"("userId", "videoId", "timestamp");

-- CreateIndex
CREATE INDEX "Payment_videoId_sessionIndex_idx" ON "Payment"("videoId", "sessionIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_userId_videoId_sessionIndex_key" ON "Payment"("userId", "videoId", "sessionIndex");

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_creatorAddress_fkey" FOREIGN KEY ("creatorAddress") REFERENCES "User"("eoaAddress") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
