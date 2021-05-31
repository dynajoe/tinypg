CREATE DATABASE tinypg_example;

\connect tinypg_example

CREATE SCHEMA IF NOT EXISTS tinypg;

SET search_path TO tinypg, public;

DROP TABLE IF EXISTS tinypg.address;
DROP TABLE IF EXISTS tinypg.customer;

CREATE TABLE tinypg.customer (
   customer_id serial PRIMARY KEY,
   first_name text,
   last_name text
);

CREATE TABLE tinypg.address (
   address_id serial PRIMARY KEY,
   customer_id int,
   street text,
   city text,
   state text,
   zip int,
   FOREIGN KEY (customer_id) REFERENCES tinypg.customer
);

WITH new_customer AS (
   INSERT INTO tinypg.customer (first_name, last_name) VALUES ('Steve', 'Jobs')
   RETURNING *
)
INSERT INTO tinypg.address (
   customer_id, street, city, state, zip)
VALUES (
   (SELECT customer_id FROM new_customer),
   '123 W 10th St',
   'Palo Alto',
   'California',
   94301
);