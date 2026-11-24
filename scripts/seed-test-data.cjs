const fs = require("node:fs");
const crypto = require("node:crypto");
const { PrismaClient } = require("@prisma/client");

function testDatabaseUrl() {
  const line = fs.readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .find(value => value.startsWith("DATABASE_TEST_URL="));
  if (!line) throw new Error("DATABASE_TEST_URL is missing");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^"|"$/g, "");
}

process.env.DATABASE_URL = testDatabaseUrl();
const prisma = new PrismaClient();
const password = process.env.TEST_STAFF_PASSWORD;
if (!password || password.length < 12) throw new Error("Set TEST_STAFF_PASSWORD to a password of at least 12 characters");

function credential(value) {
  const salt = crypto.randomBytes(32).toString("hex");
  const hash = crypto.scryptSync(value, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }).toString("hex");
  return { salt, hash };
}

async function main() {
  const business = await prisma.business.upsert({
    where: { slug: "anu-computers" },
    create: { slug: "anu-computers", name: "TEST - Anu Computers", gstin: "36ABCDE1234F1Z5" },
    update: { name: "TEST - Anu Computers", gstin: "36ABCDE1234F1Z5" },
  });

  const mainBranch = await prisma.branch.upsert({
    where: { id: "test-main-branch" },
    update: { name: "TEST - Main Store", address: "Hyderabad Test Branch", businessId: business.id },
    create: { id: "test-main-branch", name: "TEST - Main Store", address: "Hyderabad Test Branch", businessId: business.id },
  }).catch(async () => prisma.branch.upsert({
    where: { id: "test-main-branch" },
    update: { name: "TEST - Main Store", address: "Hyderabad Test Branch", businessId: business.id },
    create: { id: "test-main-branch", name: "TEST - Main Store", address: "Hyderabad Test Branch", businessId: business.id },
  }));

  const staffUsers = [
    ["TEST Sales User", "test.sales@anu.local", "SALES"],
    ["TEST Technician", "test.technician@anu.local", "TECHNICIAN"],
    ["TEST Inventory User", "test.inventory@anu.local", "INVENTORY"],
    ["TEST Finance User", "test.finance@anu.local", "FINANCE"],
  ];

  for (const [name, email, role] of staffUsers) {
    let staff = await prisma.staff.findUnique({ where: { email } });
    staff = staff
      ? await prisma.staff.update({ where: { id: staff.id }, data: { name, role, active: true, businessId: business.id } })
      : await prisma.staff.create({ data: { name, email, role, active: true, businessId: business.id } });
    await prisma.businessSetting.upsert({
      where: { key: "auth.staff." + staff.id },
      create: { key: "auth.staff." + staff.id, value: credential(password) },
      update: { value: credential(password) },
    });
  }

  const technician = await prisma.staff.findUnique({ where: { email: "test.technician@anu.local" } });
  await prisma.businessSetting.upsert({
    where: { key: "setup.profile.TECHNICIAN" },
    create: {
      key: "setup.profile.TECHNICIAN",
      value: ["JobCard:READ", "ServiceCase:READ", "Asset:READ"],
    },
    update: {
      value: ["JobCard:READ", "ServiceCase:READ", "Asset:READ"],
    },
  });
  await prisma.businessSetting.upsert({
    where: { key: "setup.fieldSecurity.profile.TECHNICIAN" },
    create: {
      key: "setup.fieldSecurity.profile.TECHNICIAN",
      value: [
        "JobCard:status:READ",
        "JobCard:diagnosis:READ",
        "JobCard:notes:READ",
        "ServiceCase:issue:READ",
        "ServiceCase:priority:READ",
        "Asset:brand:READ",
        "Asset:model:READ",
        "Asset:serialNumber:READ",
      ],
    },
    update: {
      value: [
        "JobCard:status:READ",
        "JobCard:diagnosis:READ",
        "JobCard:notes:READ",
        "ServiceCase:issue:READ",
        "ServiceCase:priority:READ",
        "Asset:brand:READ",
        "Asset:model:READ",
        "Asset:serialNumber:READ",
      ],
    },
  });

  const customer = await prisma.customer.upsert({
    where: { id: "test-customer-1" },
    update: { name: "TEST Customer One", phone: "9876543210", email: "test.customer1@example.com", address: "Hyderabad", source: "WALK_IN" },
    create: { id: "test-customer-1", name: "TEST Customer One", phone: "9876543210", email: "test.customer1@example.com", address: "Hyderabad", source: "WALK_IN" },
  }).catch(async () => prisma.customer.create({
    data: { name: "TEST Customer One", phone: "9876543210", email: "test.customer1@example.com", address: "Hyderabad", source: "WALK_IN" },
  }));

  const product = await prisma.product.upsert({
    where: { sku: "TEST-LAPTOP-001" },
    update: { name: "TEST Laptop", category: "Laptop", brand: "TEST Brand", price: 56990, cost: 52000, active: true },
    create: { name: "TEST Laptop", sku: "TEST-LAPTOP-001", category: "Laptop", brand: "TEST Brand", price: 56990, cost: 52000, active: true },
  });

  await prisma.stock.upsert({
    where: { productId_branchId: { productId: product.id, branchId: mainBranch.id } },
    update: { qty: 10, reserved: 0, reorderPoint: 2 },
    create: { productId: product.id, branchId: mainBranch.id, qty: 10, reserved: 0, reorderPoint: 2 },
  });

  const existingAsset = await prisma.asset.findFirst({
    where: { serialNumber: "TEST-ASSET-001" },
  });
  const asset = existingAsset
    ? await prisma.asset.update({
        where: { id: existingAsset.id },
        data: { customerId: customer.id, productId: product.id, brand: "TEST Brand", model: "TEST Laptop", serialNumber: "TEST-ASSET-001", condition: "Needs diagnosis" },
      })
    : await prisma.asset.create({
        data: { customerId: customer.id, productId: product.id, brand: "TEST Brand", model: "TEST Laptop", serialNumber: "TEST-ASSET-001", condition: "Needs diagnosis" },
      });

  await prisma.serviceCase.upsert({
    where: { id: "test-repair-1" },
    update: { customerId: customer.id, assetId: asset.id, issue: "TEST - Laptop not starting", status: "RECEIVED", priority: "HIGH" },
    create: { id: "test-repair-1", customerId: customer.id, assetId: asset.id, issue: "TEST - Laptop not starting", status: "RECEIVED", priority: "HIGH", jobs: { create: {} } },
  }).catch(async () => {
    await prisma.serviceCase.create({
      data: { customerId: customer.id, assetId: asset.id, issue: "TEST - Laptop not starting", status: "RECEIVED", priority: "HIGH", jobs: { create: {} } },
    });
  });
  if (technician) {
    await prisma.jobCard.updateMany({
      where: { caseId: "test-repair-1" },
      data: { technicianId: technician.id },
    });
  }

  await prisma.customField.upsert({
    where: { entity_key: { entity: "Asset", key: "dob__c" } },
    update: { label: "Asset Date", type: "DATE", required: false, options: [] },
    create: { entity: "Asset", key: "dob__c", label: "Asset Date", type: "DATE", required: false, options: [] },
  });

  console.log(JSON.stringify({
    business: business.name,
    branch: mainBranch.name,
    customer: customer.name,
    product: product.sku,
    asset: asset.serialNumber,
    staff: staffUsers.map(([, email, role]) => ({ email, role })),
  }, null, 2));
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
