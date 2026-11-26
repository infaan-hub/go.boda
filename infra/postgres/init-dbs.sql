-- Go.boda Isolated Microservice Databases (Database-per-Service)
-- Executed automatically on first PostgreSQL container boot

CREATE DATABASE auth_db;
CREATE DATABASE operator_db;
CREATE DATABASE geo_db;
CREATE DATABASE location_db;
CREATE DATABASE pricing_db;
CREATE DATABASE dispatch_db;
CREATE DATABASE trip_db;
CREATE DATABASE finance_db;
CREATE DATABASE notif_db;
CREATE DATABASE safety_db;

-- Enable PostGIS spatial extensions exclusively on geo_db (Unguja polygon & Stone Town snap)
\connect geo_db;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
