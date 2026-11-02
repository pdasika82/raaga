-- These credentials are for the isolated, loopback-only demo database.
CREATE ROLE testfold_reader LOGIN PASSWORD 'testfold-read-local-only';
GRANT CONNECT ON DATABASE raaga TO testfold_reader;
GRANT USAGE ON SCHEMA public TO testfold_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE raaga IN SCHEMA public GRANT SELECT ON TABLES TO testfold_reader;
ALTER ROLE testfold_reader SET default_transaction_read_only = on;
