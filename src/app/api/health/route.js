export async function GET(request) {
  return Response.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    message: 'Corporate Management System API is running'
  });
}