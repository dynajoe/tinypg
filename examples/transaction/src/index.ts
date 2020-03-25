import { TinyPg } from 'tinypg'
import * as Path from 'path'

// Create a customer and address in different tables in a transaction
async function createAndQueryCustomer(db: TinyPg): Promise<void> {
   const customer_id = await db.transaction(async transaction_db => { // BEGIN
      const create_result = await transaction_db.sql('customer.create', { // INSERT
         first_name: 'Steve',
         last_name: 'Jobs',
      })

      const customer_id = create_result.rows[0].customer_id

      await transaction_db.sql('address.create', { // INSERT
         customer_id: customer_id,
         street: '123 W 10th St',
         city: 'Palo Alto',
         state: 'California',
         zip: 94301,
      })

      return customer_id
   }) // COMMIT

   const fetch_result = await db.sql('customer.fetch', { // SELECT
      customer_id: customer_id,
   })

   const customer = fetch_result.rows[0]

   console.log(customer)
}

// Bootstrap the TinyPG instance and close database connection when done.
async function main(): Promise<void> {
   const db = new TinyPg({
      connection_string: `postgres://postgres:tinypg@localhost:54999/tinypg_example?sslmode=disable`,
      root_dir: Path.join(__dirname, './queries'),
   })

   db.events.on('query', context => {
      console.log(`Executing query: ${context.name}`)
   })

   db.events.on('result', context => {
      console.log(`Query Complete: ${context.name} (${context.duration}ms)`)
   })

   await createAndQueryCustomer(db)

   await db.close()
}

void main()
