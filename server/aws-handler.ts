import { handle } from 'hono/aws-lambda'
import { createApiApp } from './app'

const app = createApiApp()

export const handler = handle(app)
