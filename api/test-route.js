export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    success: true,
    message: 'API route is working',
    url: req.url,
    method: req.method,
    query: req.query
  });
}
