# Anu Computers CRM

Responsive sales, inventory, repair service and billing CRM for Anu Computers, Secunderabad.

## Quick start

```bash
npm install
cp .env.example .env
npx prisma db push
npm run dev
```

Open http://localhost:3000. Set `DATABASE_URL` to a PostgreSQL connection string. The project ships with a polished sample dashboard and API/database foundations. Demo records are illustrative; external messaging/payment integrations need configuration.

## Modules

Dashboard; leads; customers; products; inventory; suppliers; purchases; opportunities; quotes; orders; POS; service cases; job cards; technicians; spare parts; warranties; invoices; payments; communications; reports; administration. The workspace UI includes navigation, functional lists, search, modals and record creation for core workflows. The Prisma schema establishes the production data model for each workflow.

## Current scope

This is an initial implementation, not a production-ready deployment. UI demo data is local in browser state; API endpoints for customers, products and service cases use Prisma. Add authentication, authorization, transactions, stock reservation, GST configuration and official WhatsApp/Meta integrations before handling real customer data. Do not store device passwords in plain text.

## Technology

Next.js App Router, React, TypeScript, Tailwind CSS, Prisma, PostgreSQL, Lucide React.
