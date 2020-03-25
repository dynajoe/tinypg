SELECT customer.*, row_to_json(address.*) AS address
FROM tinypg.customer
   INNER JOIN tinypg.address ON address.customer_id = customer.customer_id
WHERE address.state = :state
   AND customer.first_name = :first_name
   AND customer.last_name = :last_name;