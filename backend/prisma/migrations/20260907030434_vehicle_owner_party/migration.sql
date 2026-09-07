/*
  Warnings:

  - You are about to drop the column `ownership` on the `Vehicle` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Vehicle" DROP COLUMN "ownership",
ADD COLUMN     "ownerPartyId" UUID;

-- DropEnum
DROP TYPE "VehicleOwnership";

-- CreateIndex
CREATE INDEX "Vehicle_tenantId_ownerPartyId_idx" ON "Vehicle"("tenantId", "ownerPartyId");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_ownerPartyId_fkey" FOREIGN KEY ("ownerPartyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;
