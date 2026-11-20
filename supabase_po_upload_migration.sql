-- Run once in Supabase → SQL Editor (needed for the AI PO upload feature).
-- Lets customers attach Excel, CSV, Word and text files (in addition to PDF and images) to a request.
update storage.buckets
   set allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','text/csv','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword'],
       file_size_limit = 5242880
 where id = 'enquiry-files';
