'use strict';

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Kavach database…');

  const passwordHash = await bcrypt.hash('KavachDev@2024', 12);
  const workerPasswordHash = await bcrypt.hash('Worker@1234', 12);

  // ── 1. Tenants ──────────────────────────────────────
  const tenants = await Promise.all([
    prisma.tenant.upsert({
      where: { slug: 'blinkit' },
      update: {},
      create: {
        slug: 'blinkit',
        displayName: 'Blinkit Commerce',
        premiumMultiplier: 1.00,
        allowedAdminDomains: ['blinkit.com', 'blinkit.dev'],
        oauthIssuer: 'https://auth.blinkit.com',
        oauthClientId: 'kavach_blinkit_client_id',
        config: { default_city: 'Delhi', default_zone: 'delhi-central' },
      },
    }),
    prisma.tenant.upsert({
      where: { slug: 'zepto' },
      update: {},
      create: {
        slug: 'zepto',
        displayName: 'Zepto',
        premiumMultiplier: 1.05,
        allowedAdminDomains: ['zeptonow.com', 'zepto.dev'],
        oauthIssuer: 'https://auth.zeptonow.com',
        oauthClientId: 'kavach_zepto_client_id',
        config: { default_city: 'Mumbai', default_zone: 'mumbai-west' },
      },
    }),
    prisma.tenant.upsert({
      where: { slug: 'swiggy_instamart' },
      update: {},
      create: {
        slug: 'swiggy_instamart',
        displayName: 'Swiggy Instamart',
        premiumMultiplier: 1.00,
        allowedAdminDomains: ['swiggy.in', 'swiggy.dev'],
        oauthIssuer: 'https://auth.swiggy.in',
        oauthClientId: 'kavach_swiggy_client_id',
        config: { default_city: 'Bangalore', default_zone: 'blr_koramangala' },
      },
    }),
  ]);

  const [blinkit, zepto, swiggy] = tenants;
  console.log(`  ✅ Created ${tenants.length} tenants`);

  // ── 2. Admin Users ──────────────────────────────────
  const admins = await Promise.all([
    prisma.adminUser.upsert({
      where: { email: 'admin@blinkit.dev' },
      update: {},
      create: {
        tenantId: blinkit.id,
        email: 'admin@blinkit.dev',
        role: 'tenant_admin',
      },
    }),
    prisma.adminUser.upsert({
      where: { email: 'admin@zepto.dev' },
      update: {},
      create: {
        tenantId: zepto.id,
        email: 'admin@zepto.dev',
        role: 'tenant_admin',
      },
    }),
    prisma.adminUser.upsert({
      where: { email: 'admin@swiggy.dev' },
      update: {},
      create: {
        tenantId: swiggy.id,
        email: 'admin@swiggy.dev',
        role: 'tenant_admin',
      },
    }),
    prisma.adminUser.upsert({
      where: { email: 'adjudicator@kavach.dev' },
      update: {},
      create: {
        tenantId: null, // super / platform-wide adjudicator
        email: 'adjudicator@kavach.dev',
        role: 'claims_adjudicator',
      },
    }),
  ]);
  console.log(`  ✅ Created ${admins.length} admin users`);

  // ── 3. Dark Stores ──────────────────────────────────
  const darkStores = await Promise.all([
    // Blinkit Stores
    prisma.darkStore.create({
      data: {
        tenantId: blinkit.id,
        zoneId: 'delhi-central',
        name: 'Blinkit Connaught Place Hub #1',
        latitude: 28.6315,
        longitude: 77.2167,
        qrSecret: 'blinkit_qr_secret_delhi_001_32char',
      },
    }),
    prisma.darkStore.create({
      data: {
        tenantId: blinkit.id,
        zoneId: 'delhi-south',
        name: 'Blinkit Saket Hub #2',
        latitude: 28.5244,
        longitude: 77.2065,
        qrSecret: 'blinkit_qr_secret_delhi_002_32char',
      },
    }),
    // Zepto Stores
    prisma.darkStore.create({
      data: {
        tenantId: zepto.id,
        zoneId: 'mumbai-west',
        name: 'Zepto Andheri West Store #1',
        latitude: 19.1136,
        longitude: 72.8697,
        qrSecret: 'zepto_qr_secret_mumbai_001_32char',
      },
    }),
    prisma.darkStore.create({
      data: {
        tenantId: zepto.id,
        zoneId: 'mumbai-west',
        name: 'Zepto Bandra Store #2',
        latitude: 19.0596,
        longitude: 72.8295,
        qrSecret: 'zepto_qr_secret_mumbai_002_32char',
      },
    }),
    // Swiggy Stores
    prisma.darkStore.create({
      data: {
        tenantId: swiggy.id,
        zoneId: 'blr_koramangala',
        name: 'Swiggy Instamart Koramangala Hub #4',
        latitude: 12.9352,
        longitude: 77.6245,
        qrSecret: 'swiggy_qr_secret_blr_001_32charrr',
      },
    }),
    prisma.darkStore.create({
      data: {
        tenantId: swiggy.id,
        zoneId: 'blr_indiranagar',
        name: 'Swiggy Instamart Indiranagar Hub #2',
        latitude: 12.9784,
        longitude: 77.6408,
        qrSecret: 'swiggy_qr_secret_blr_002_32charrr',
      },
    }),
  ]);
  console.log(`  ✅ Created ${darkStores.length} dark stores`);

  // ── 4. Demo Workers ─────────────────────────────────
  const workers = await Promise.all([
    prisma.worker.upsert({
      where: { phoneNumber: '+919876543210' },
      update: {},
      create: {
        tenantId: blinkit.id,
        name: 'Rajan Kumar',
        phoneNumber: '+919876543210',
        email: 'rajan@demo.kavach.dev',
        platformWorkerId: 'BLK-99214',
        zoneId: 'delhi-central',
        currentCity: 'Delhi',
        state: 'Delhi',
        kycVerified: true,
        passwordHash: workerPasswordHash,
        bankAccountNumber: 'enc_acc_992141234',
        bankIfscCode: 'HDFC0001234',
        accountHolderName: 'Rajan Kumar',
        bankVerificationStatus: 'verified',
      },
    }),
    prisma.worker.upsert({
      where: { phoneNumber: '+919876543211' },
      update: {},
      create: {
        tenantId: zepto.id,
        name: 'Amit Patel',
        phoneNumber: '+919876543211',
        email: 'amit@demo.kavach.dev',
        platformWorkerId: 'ZPT-44102',
        zoneId: 'mumbai-west',
        currentCity: 'Mumbai',
        state: 'Maharashtra',
        kycVerified: true,
        passwordHash: workerPasswordHash,
        bankAccountNumber: 'enc_acc_441021234',
        bankIfscCode: 'ICIC0005678',
        accountHolderName: 'Amit Patel',
        bankVerificationStatus: 'verified',
      },
    }),
    prisma.worker.upsert({
      where: { phoneNumber: '+919876543212' },
      update: {},
      create: {
        tenantId: swiggy.id,
        name: 'Priya Sharma',
        phoneNumber: '+919876543212',
        email: 'priya@demo.kavach.dev',
        platformWorkerId: 'SWG-88219',
        zoneId: 'blr_koramangala',
        currentCity: 'Bangalore',
        state: 'Karnataka',
        kycVerified: true,
        passwordHash: workerPasswordHash,
        bankAccountNumber: 'enc_acc_882191234',
        bankIfscCode: 'SBIN0009999',
        accountHolderName: 'Priya Sharma',
        bankVerificationStatus: 'verified',
      },
    }),
  ]);
  console.log(`  ✅ Created ${workers.length} demo workers`);

  // ── 5. Demo Policies ────────────────────────────────
  const today = new Date();
  const sevenDaysLater = new Date(today);
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

  const tierConfigs = {
    1: { name: 'basic', weekly: 49, perEvent: 200, maxEvents: 3, ceiling: 600 },
    2: { name: 'standard', weekly: 89, perEvent: 350, maxEvents: 4, ceiling: 1400 },
    3: { name: 'premium', weekly: 129, perEvent: 500, maxEvents: 6, ceiling: 3000 },
  };

  const policies = await Promise.all(
    workers.map(async (worker, idx) => {
      const tierNum = (idx % 3) + 1;
      const config = tierConfigs[tierNum];

      const policy = await prisma.policy.create({
        data: {
          tenantId: worker.tenantId,
          workerId: worker.id,
          tier: tierNum,
          premiumWeekly: config.weekly,
          maxPayoutPerEvent: config.perEvent,
          maxPayoutsPerMonth: config.maxEvents,
          coverageCeiling: config.ceiling,
          triggerDayLimit: 1,
          coveragePercentage: 100.0,
          reservedAmount: 0,
          settledAmount: 0,
          startDate: today,
          endDate: sevenDaysLater,
          autoRenew: true,
          status: 'active',
          coverages: {
            create: [
              {
                triggerType: 'rainfall',
                isCovered: true,
                thresholdValue: 15.0,
                minimumDurationMinutes: 30,
              },
              {
                triggerType: 'heatwave',
                isCovered: true,
                thresholdValue: 40.0,
                minimumDurationMinutes: 60,
              },
              {
                triggerType: 'poor_aqi',
                isCovered: tierNum >= 2,
                thresholdValue: 300.0,
                minimumDurationMinutes: 120,
              },
              {
                triggerType: 'platform_outage',
                isCovered: tierNum >= 2,
                thresholdValue: 0.0,
                minimumDurationMinutes: 45,
              },
            ],
          },
        },
      });

      return policy;
    })
  );
  console.log(`  ✅ Created ${policies.length} demo policies with parametric coverages`);

  console.log('\n🎉 Seed complete! You can now log in and test all services.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
