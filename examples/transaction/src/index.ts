import * as T from 'tinypg'
import * as Path from 'path'

interface Address {
   address_id: number
   customer_id: number

   street: string
   city: string
   state: string
   zip: number
}

interface Customer {
   customer_id: number

   first_name: string
   last_name: string
   address: Address
}

const util = {
   // exactlyOne expects one row in the result
   exactlyOne<T extends Object>(res: T.Result<T>): T {
      if (res.rows.length != 1) {
         throw new Error('expected exactly one row')
      }
      return res.rows[0]
   } 
}

// Create a customer and address in different tables in a transaction
async function createAndQueryCustomer(db: T.TinyPg): Promise<Customer> {
   // BEGIN
   const customer_id = await db.transaction<number>(async transaction_db => { 
      // INSERT
      const create_result = await transaction_db.sql<{customer_id: number}>('customer.create', {
         first_name: 'Steve',
         last_name: 'Jobs',
      })

      const { customer_id } = util.exactlyOne(create_result)

      // INSERT
      await transaction_db.sql('address.create', {
         customer_id: customer_id,
         street: '123 W 10th St',
         city: 'Palo Alto',
         state: 'California',
         zip: 94301,
      })

      // COMMIT
      return customer_id
   }) 

   // SELECT
   return util.exactlyOne(await db.sql<Customer>('customer.fetch', {
      customer_id: customer_id,
   }))
}

// Bootstrap the TinyPG instance and close database connection when done.
async function main(): Promise<void> {
   const db = new T.TinyPg({
      connection_string: `postgres://postgres:tinypg@localhost:54999/tinypg_example?sslmode=disable`,
      root_dir: Path.join(__dirname, './sql'),
   })

   db.events.on('query', context => {
      console.log(`Executing query: ${context.name}`)
   })

   db.events.on('result', context => {
      console.log(`Query Complete: ${context.name} (${context.duration}ms)`)
   })

   const customer = await createAndQueryCustomer(db)
   console.log(customer)

   await db.close()
}

void main()
