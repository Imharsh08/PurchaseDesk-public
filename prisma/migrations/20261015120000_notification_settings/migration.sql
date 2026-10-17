-- Email notifications per event (Settings → Email notifications): on/off, doers, extra To / CC, attachments.
ALTER TABLE "company_settings" ADD COLUMN "notifications" JSONB;
