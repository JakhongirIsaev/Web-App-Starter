ALTER TABLE "client_documents" ADD COLUMN "mime_type" text;
ALTER TABLE "client_documents" ADD COLUMN "size_bytes" integer;
ALTER TABLE "client_documents" ADD COLUMN "deleted_at" timestamp;