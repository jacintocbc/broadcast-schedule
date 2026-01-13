import { handleCRUD } from './utils/crud.js';

export default async function handler(req, res) {
  return handleCRUD('producers', req, res);
}
