SELECT customer.*, row_to_json(address.*) AS address
FROM tinypg.customer
   INNER JOIN tinypg.address ON address.customer_id = customer.customer_id
WHERE customer.customer_id = :customer_id;