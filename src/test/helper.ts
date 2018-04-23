import { TinyPg, TinyPgOptions } from '../'
import * as Pg from 'pg'

export const connection_string = 'postgres://postgres@localhost:5432/?sslmode=disable'

export async function dbQuery(query: string, args: any[] = null): Promise<Pg.QueryResult> {
   const client = new Pg.Client(connection_string)
   await client.connect()

   try {
      return await client.query(query, args)
   } finally {
      void client.end()
   }
}

export function getA(): Promise<Pg.QueryResult> {
   return dbQuery('SELECT * FROM __tiny_test_db.a;')
}

export function insertA(text: string): Promise<Pg.QueryResult> {
   return dbQuery('INSERT INTO __tiny_test_db.a (text) VALUES ($1);', [text])
}

export function setUpDb(): Promise<any> {
   const commands = [
      'ROLLBACK;',
      'DROP SCHEMA IF EXISTS __tiny_test_db CASCADE;',
      'CREATE SCHEMA __tiny_test_db;',
      'SET search_path TO __tiny_test_db, public;',
      'CREATE TABLE __tiny_test_db.a (id serial PRIMARY KEY, text text UNIQUE);',
   ]

   return commands.reduce((acc, c) => {
      return acc.then<any>(() => dbQuery(c))
   }, Promise.resolve())
}

export function newTiny(options?: Partial<TinyPgOptions>): TinyPg {
   return new TinyPg({
      connection_string: connection_string,
      root_dir: __dirname + '/sql/',
      ...options,
   })
}
