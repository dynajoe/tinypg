INSERT INTO tinypg.address (
   customer_id,
   street,
   city,
   state,
   zip
)
VALUES (
   :customer_id,
   :street,
   :city,
   :state,
   :zip
)
RETURNING *;